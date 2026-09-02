import DB from '../db';
import { Db } from 'mongodb';

export function fetchAppearance() {
  return (DB.db as unknown as Db).collection('appearance').find({}).toArray();
}
