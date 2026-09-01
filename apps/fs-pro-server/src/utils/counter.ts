/* eslint-disable @typescript-eslint/no-misused-promises */
import respond from '../helpers/responseHandler';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import mongoose from 'mongoose';
import DB from '../db';
import log from '../helpers/logger';
import { Db } from 'mongodb';
import { DrizzleDatabase } from '../db/drizzle';

/**
 * Same prefix/id-field mapping `getCurrentCounter`'s Mongo branch has
 * always used (`counter.prefix` read from the Mongo `counter` collection
 * document, and the `switch (req.query.model)` below it) - kept as static
 * maps here so the Postgres branch can share the exact same id shape
 * without a Mongo connection.
 */
const COUNTER_PREFIXES: Record<string, string> = {
  season: 'S-',
  player: 'P',
  manager: 'MG-',
  competition: 'C',
};

const COUNTER_ID_FIELDS: Record<string, string> = {
  player: 'PlayerID',
  competition: 'CompetitionID',
  season: 'SeasonID',
  manager: 'Key',
};

function formatCounterId(model: string, value: number): string {
  const prefix = COUNTER_PREFIXES[model] ?? COUNTER_PREFIXES.player;
  let number = 1000000 + value;
  return prefix + number.toString().substring(1);
}

/**
 * `nextval()` on a Postgres sequence atomically increments AND returns the
 * new value in one round trip - unlike the Mongo path's separate
 * read-then-increment-later (`getCurrentCounter` reads `sequence_value`,
 * the id is used to create a record, then `incrementCounter` increments
 * *afterward*), which has a real race: two concurrent creates can both
 * read the same `sequence_value` and compute the same id, then collide on
 * the unique constraint (this happened in this dev DB with Manager's
 * `MG-000026`). The sequence has no separate increment step, so
 * `incrementCounter` becomes a no-op under this backend - see below.
 */
async function nextSequenceValue(model: string): Promise<number> {
  const sql = DrizzleDatabase.getInstance().sql;
  const seqName = `${model}_counter_seq`;
  const [row] = await sql<{ val: string }[]>`SELECT nextval(${seqName}) as val`;
  return Number(row.val);
}

export function incrementCounter(counterName: string) {
  if (DB.ormType === 'drizzle') {
    // No-op - the Postgres sequence already atomically reserved the id in
    // getCurrentCounter/getCurrentCounter2, there's nothing left to bump.
    return Promise.resolve(null);
  }

  return (DB.db as unknown as Db).collection('counter').findOneAndUpdate(
    { _id: counterName as any },
    {
      $inc: { sequence_value: 1 },
    }
  );
}

// TODO: add a validator for all routes!
export const getCurrentCounter: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const model = String(req.query.model ?? 'player');

  if (DB.ormType === 'drizzle') {
    nextSequenceValue(model)
      .then((value) => {
        const id = formatCounterId(model, value);
        log(`Id => ${id}`);
        req.body.data[COUNTER_ID_FIELDS[model] ?? 'PlayerID'] = id;
        next();
      })
      .catch((err) => {
        log(`Error generating ${model} id from Postgres sequence => ${err}`);
        respond.fail(res, 404, 'Counter not found!');
      });
    return;
  }

  const counterName = model + '_counter';
  // TODO: Make this more flexible and robust :))
  mongoose.connection.db
    .collection('counter')
    .findOne({ _id: counterName }, async (err, counter) => {
      if (!err) {
        let number = 1000000 + (await counter!.sequence_value) + 1;
        number = number.toString().substring(1);
        const id: string = counter!.prefix + number;

        log(`Id => ${id}`);

        let idField;
        switch (req.query.model) {
          case 'player':
            idField = 'PlayerID';
            break;
          case 'competition':
            idField = 'CompetitionID';
            break;
          case 'season':
            idField = 'SeasonID';
            break;
          case 'manager':
            idField = 'Key';
            break;
          default:
            idField = 'PlayerID';
            break;
        }

        req.body.data[idField] = id;

        next();
      } else {
        respond.fail(res, 404, 'Counter not found!');
      }
    });
};

/** Unused anywhere in the codebase today (confirmed) - left Mongo-only. */
export function getCurrentCounter2(model: string) {
  const counterName = model + '_counter';

  // TODO: Make this more flexible and robust :))
  // TODO: (9/07/21) - Omo, this tin was wasting my time so I made the increment kini random
  return mongoose.connection.db
    .collection('counter')
    .findOne({ _id: counterName })
    .then(async (counter) => {
      let number =
        1000000 +
        (await counter!.sequence_value) +
        Math.round(Math.random() * 10);
      number = number.toString().substring(1);
      const id: string = counter!.prefix + number;
      console.log('id => ', id);
      return id;
    })
    .catch((c) => {
      throw new Error(`${model} Counter not found!`);
    });
}
