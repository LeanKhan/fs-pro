/* eslint-disable @typescript-eslint/no-misused-promises */
import respond from '../helpers/responseHandler';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import log from '../helpers/logger';
import { DrizzleDatabase } from '../db/drizzle';

/**
 * Same prefix/id-field mapping the old Mongo `counter` collection used
 * (`counter.prefix`, and the `switch (req.query.model)` shape) - kept as
 * static maps here so ids keep the same format.
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
 * new value in one round trip - no separate increment step needed
 * (`incrementCounter` below is a no-op), and no race condition between
 * concurrent creates the way a read-then-increment-later pattern would have.
 */
async function nextSequenceValue(model: string): Promise<number> {
  const sql = DrizzleDatabase.getInstance().sql;
  const seqName = `${model}_counter_seq`;
  const [row] = await sql<{ val: string }[]>`SELECT nextval(${seqName}) as val`;
  return Number(row.val);
}

export function incrementCounter(counterName: string) {
  // No-op - the Postgres sequence already atomically reserved the id in
  // getCurrentCounter, there's nothing left to bump.
  return Promise.resolve(null);
}

// TODO: add a validator for all routes!
export const getCurrentCounter: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const model = String(req.query.model ?? 'player');

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
};
