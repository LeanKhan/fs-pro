import { AwardInterface } from '../controllers/awards/awards.model';

export interface IAwardFilter {
  Season?: string;
}

/**
 * `Recipient` is polymorphic (a Player or Manager id depending on `Type` -
 * Postgres can't FK one column against two tables, so it's a plain uuid
 * there with no `.references()`, same shape Mongo's untyped ObjectId
 * always was). Resolving it - along with `Club`/`Season` - into full
 * objects is deliberately NOT part of this repository: it needs
 * per-recipient-type branching (Player vs Manager repository) and a small
 * batch fetch+merge, so it lives in `awards/index.ts`'s `getAwards`
 * instead, the same shape as Day's `attachFixturesToDays`/Player's
 * `attachPlayersAndFixtures`.
 */
export interface IAwardRepository {
  findAll(filter?: IAwardFilter): Promise<AwardInterface[]>;
  createMany(data: Partial<AwardInterface>[]): Promise<AwardInterface[]>;
}
