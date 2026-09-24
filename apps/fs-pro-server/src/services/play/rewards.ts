import { eq, sql as drizzleSql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubs, transferLedger } from '../../db/drizzle/schema';

/**
 * Club level from XP: level n needs 100 * n^2 XP (level 0 below 100). The
 * curve is a placeholder tuning value.
 */
export const xpForLevel = (level: number) => 100 * level * level;
export const levelForXp = (xp: number) => Math.floor(Math.sqrt(Math.max(xp, 0) / 100));

/**
 * Credits cash + XP to a club and records the cash in the ledger.
 * Ledger convention: `BuyerClubId` is the club RECEIVING the reward, `Type` is
 * 'match_reward' or 'challenge_reward', `Note` describes it.
 */
export async function payClub(
  clubId: string,
  reward: { cash: number; xp: number },
  type: 'match_reward' | 'challenge_reward',
  note: string
) {
  const db = DrizzleDatabase.getInstance().database;
  await db.transaction(async (tx) => {
    await tx
      .update(clubs)
      .set({
        Budget: drizzleSql`coalesce(${clubs.Budget}, 0) + ${reward.cash}`,
        XP: drizzleSql`${clubs.XP} + ${reward.xp}`,
        updatedAt: new Date(),
      })
      .where(eq(clubs.id, clubId));

    if (reward.cash > 0) {
      await tx.insert(transferLedger).values({
        Type: type,
        BuyerClubId: clubId,
        Amount: reward.cash,
        Note: note,
        updatedAt: new Date(),
      });
    }
  });
}
