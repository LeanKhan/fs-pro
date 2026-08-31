/* eslint-disable @typescript-eslint/no-unsafe-return */
import log from '../../helpers/logger';
import DB from '../../db';
import { PlayerInterface } from '../../interfaces/Player';
import { calculatePlayerValue } from '../../utils/players';
import { PlayerMatchDetailsInterface } from '../player-match/player-match.model';
import { Types } from 'mongoose';
import { PlayerRepositoryFactory } from '../../repositories/PlayerRepositoryFactory';
import { IPlayerFilter } from '../../repositories/PlayerRepository';

/**
 * Repository-backed functions below are for the identity/CRUD surface that
 * has no arbitrary-query or Mongo-operator update in play - `update()` only
 * accepts plain fields. `updatePlayersDetails` (end-of-year progression),
 * `toggleSigned`, `updatePlayers` (bulk), and every aggregate-pipeline stats
 * function below stay on the raw functions, unchanged. See FUTURE-PLANS.md.
 */
let playerRepo: ReturnType<typeof PlayerRepositoryFactory.create> | null = null;

function getPlayerRepo() {
  if (!playerRepo) {
    playerRepo = PlayerRepositoryFactory.create();
  }
  return playerRepo;
}

export async function getPlayerById(id: string) {
  return getPlayerRepo().findById(id);
}

export async function getPlayers(filter?: IPlayerFilter) {
  return getPlayerRepo().findAll(filter);
}

export async function updatePlayerFields(id: string, data: Partial<PlayerInterface>) {
  return getPlayerRepo().update(id, data);
}

export async function deletePlayerById(id: string) {
  return getPlayerRepo().delete(id);
}

export async function createPlayer(data: Partial<PlayerInterface>) {
  data.Value = calculatePlayerValue(data.Position as string, data.Rating as number, data.Age as number);
  return getPlayerRepo().create(data);
}

/**
 * fetchAllPlayers
 *
 * fetch multiple Players based on query
 * default behaviour is to send all players in the db
 */
export function fetchAll(query: Record<string, unknown> = {}) {
  return DB.Models.Player.find(query).lean().exec();
}

/**
 * fetchAllPlayers
 *
 * fetch multiple Players based on query
 * default behaviour is to send all players in the db
 */
export function findOnePlayer(query: Record<string, unknown> = {}, select: string | boolean) {
  return DB.Models.Player.findOne(query).select(select).lean().exec();
}

/**
 * FetchOneById
 *
 * Fetch a specific Player by id
 * @param id
 */
export function fetchOneById(id: string) {
  return DB.Models.Player.findById(id).lean().exec();
}

export function updateById(id: string, update: any): Promise<PlayerInterface> {
  return DB.Models.Player.findByIdAndUpdate(id, update, { new: true })
    .lean()
    .exec();
}
/**
 * Toggle Signed
 * @param playerId
 * @param value
 */
export function toggleSigned(
  playerId: string,
  value: boolean,
  clubCode: string | null,
  clubId: string | null
) {
  return DB.Models.Player.findByIdAndUpdate(playerId, {
    $set: { isSigned: !value, ClubCode: clubCode, Club: clubId },
  })
    .lean()
    .exec();
}

export function updatePlayers(query: any, update: any) {
  return DB.Models.Player.updateMany(query, update, { multi: true });
}

export function getPlayerStats(calendar_id: string) {
  return DB.Models.PlayerMatch.aggregate(
    [
      {
        $lookup: {
          from: 'Fixtures',
          localField: 'Fixture',
          foreignField: '_id',
          as: 'fixture',
        },
      },
      { $unwind: '$fixture' },
      {
        $lookup: {
          from: 'Seasons',
          localField: 'fixture.Season',
          foreignField: '_id',
          as: 'season',
        },
      },
      { $unwind: '$season' },
      { $match: { 'season.Calendar': new Types.ObjectId(calendar_id) } }, // Filter by the Year
      {
        $group: {
          _id: '$Player',
          goals: { $sum: '$Goals' },
          saves: { $sum: '$Saves' },
          passes: { $sum: '$Passes' },
          tackles: { $sum: '$Tackles' },
          assists: { $sum: '$Assists' },
          clean_sheets: { $sum: '$CleanSheets' },
          dribbles: { $sum: '$Dribbles' },
          points: { $avg: '$Points' },
          form: { $avg: '$Form' },
        },
      },
      {
        $lookup: {
          from: 'Players',
          localField: '_id',
          foreignField: '_id',
          as: 'player',
        },
      }, // Get the Player's details
      { $unwind: '$player' },
      { $sort: { points: -1 } },
    ],
    () => {
      log('Player Match Details Aggregate performed!');
    }
  );
}

export function getSpecificPlayerStats(matcher: any, sorter: any) {
  return DB.Models.PlayerMatch.aggregate(
    [
      {
        $lookup: {
          from: 'Fixtures',
          localField: 'Fixture',
          foreignField: '_id',
          as: 'fixture',
        },
      },
      { $unwind: '$fixture' },
      {
        $lookup: {
          from: 'Seasons',
          localField: 'fixture.Season',
          foreignField: '_id',
          as: 'season',
        },
      },
      { $unwind: '$season' },
      { $match: matcher }, // Filter by the Year
      {
        $group: {
          _id: '$Player',
          goals: { $sum: '$Goals' },
          saves: { $sum: '$Saves' },
          passes: { $sum: '$Passes' },
          tackles: { $sum: '$Tackles' },
          assists: { $sum: '$Assists' },
          clean_sheets: { $sum: '$CleanSheets' },
          dribbles: { $sum: '$Dribbles' },
          points: { $avg: '$Points' },
          form: { $avg: '$Form' },
        },
      },
      {
        $lookup: {
          from: 'Players',
          localField: '_id',
          foreignField: '_id',
          as: 'player',
        },
      }, // Get the Player's details
      { $unwind: '$player' },
      { $sort: sorter },
    ],
    () => {
      log('Player Match Details Aggregate performed!');
    }
  );
}

export function allPlayerStats(
  season: string
): Promise<PlayerMatchDetailsInterface[]> {
  return DB.Models.PlayerMatch.aggregate(
    [
      {
        $lookup: {
          from: 'Fixtures',
          localField: 'Fixture',
          foreignField: '_id',
          as: 'fixture',
        },
      },
      { $unwind: '$fixture' },
      { $match: { 'fixture.Season': new Types.ObjectId(season) } },
       {
        $lookup: {
          from: 'Players',
          localField: 'Player',
          foreignField: '_id',
          as: 'player',
        },
      },
      { $unwind: '$player' },
    {
        $group: {
          _id: '$Player',
          goals: { $sum: '$Goals' },
          saves: { $sum: '$Saves' },
          passes: { $sum: '$Passes' },
          tackles: { $sum: '$Tackles' },
          assists: { $sum: '$Assists' },
          clean_sheets: { $sum: '$CleanSheets' },
          dribbles: { $sum: '$Dribbles' },
          points: { $avg: '$Points' },
          form: { $avg: '$Form' },
          player: { "$first": "$player" },
          fixture: { "$first": "$fixture" },
         count: { $sum: 1 }
        }
      },
    ],
    () => {
      log('Player Match Stats for entire Season gotten!');
    }
  );
}

/**
 *
 * [
      {
        $lookup: {
          from: 'Fixtures',
          localField: 'Fixture',
          foreignField: '_id',
          as: 'fixture',
        },
      },
      { $unwind: '$fixture' },
      { $match: { 'fixture.Season': ObjectId("60f23609a730eb4838371762") } },
       {
        $lookup: {
          from: 'Players',
          localField: 'Player',
          foreignField: '_id',
          as: 'player',
        },
      },
      { $unwind: '$player' },
          {
        $group: {
          _id: '$Player',
          goals: { $sum: '$Goals' },
          saves: { $sum: '$Saves' },
          passes: { $sum: '$Passes' },
          tackles: { $sum: '$Tackles' },
          assists: { $sum: '$Assists' },
          clean_sheets: { $sum: '$CleanSheets' },
          dribbles: { $sum: '$Dribbles' },
          points: { $avg: '$Points' },
          form: { $avg: '$Form' },
          player: { "$first": "$player" },
          fixture: { "$first": "$fixture" },
         count: { $sum: 1 }
        }
      },

      { $sort: {'points': -1} }
    ]
 * */


/**
 * Create Many Players
 */
export function createMany(players: any[]) {
  return DB.Models.Player.insertMany(players, { ordered: true });
}