import { eq } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { IUser } from '../../controllers/user/user.model';
import * as schema from '../../db/drizzle/full-schema';
import { users } from '../../db/drizzle/schema';
import { IUserRepository } from '../UserRepository';
import { hashPassword } from '../../utils/auth';

type DrizzleDb = PostgresJsDatabase<typeof schema>;
type UserRow = typeof users.$inferSelect;

/** Same `id` -> `_id` remap as DrizzlePlaceRepository, for the same reason:
 * `IUser` (and every Mongo-backed response) uses `_id`, not Drizzle's `id`
 * column-key. `mongoId` is migration-only bookkeeping, dropped here too. */
function toUser(row: UserRow): IUser {
  const { id, mongoId, ...rest } = row;
  return { _id: id, ...rest } as unknown as IUser;
}

export class DrizzleUserRepository implements IUserRepository {
  constructor(private db: DrizzleDb) {}

  async findById(id: string): Promise<IUser | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return user ? toUser(user) : null;
  }

  async findByUsername(username: string): Promise<IUser | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.Username, username))
      .limit(1);
    return user ? toUser(user) : null;
  }

  async create(data: Partial<IUser>): Promise<IUser> {
    const insert: Record<string, unknown> = { ...data, updatedAt: new Date() };
    if (insert.Password) {
      insert.Password = await hashPassword(insert.Password as string);
    }

    const [user] = await this.db
      .insert(users)
      .values(insert as typeof users.$inferInsert)
      .returning();

    return toUser(user);
  }

  async update(id: string, data: Partial<IUser>): Promise<IUser | null> {
    const update: Record<string, unknown> = { ...data, updatedAt: new Date() };
    if (update.Password) {
      update.Password = await hashPassword(update.Password as string);
    }

    const [user] = await this.db
      .update(users)
      .set(update as Partial<typeof users.$inferInsert>)
      .where(eq(users.id, id))
      .returning();

    return user ? toUser(user) : null;
  }
}
