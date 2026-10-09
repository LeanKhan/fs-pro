import { createHash, randomBytes } from 'crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { authTokens } from '../../db/drizzle/schema';

/**
 * One-time links for email verification and password reset. The emailed
 * token is 32 random bytes; only its SHA-256 is stored, so a database leak
 * doesn't leak working links. Issuing a new token voids the user's earlier
 * unused ones of the same kind, and a token works once.
 */

export type TokenKind = 'verify' | 'reset';

const TTL_MS: Record<TokenKind, number> = {
  verify: 24 * 60 * 60 * 1000,
  reset: 60 * 60 * 1000,
};

const db = () => DrizzleDatabase.getInstance().database;
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export async function issueToken(userId: string, kind: TokenKind): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db().transaction(async (tx) => {
    await tx
      .update(authTokens)
      .set({ UsedAt: new Date() })
      .where(and(eq(authTokens.UserId, userId), eq(authTokens.Kind, kind), isNull(authTokens.UsedAt)));
    await tx.insert(authTokens).values({
      UserId: userId,
      Kind: kind,
      TokenHash: hash(token),
      ExpiresAt: new Date(Date.now() + TTL_MS[kind]),
    });
  });
  return token;
}

/** Marks the token used and returns its user, or null if it is unknown, expired, used or of another kind. */
export async function consumeToken(token: string, kind: TokenKind): Promise<string | null> {
  if (!token || token.length > 200) return null;
  const rows = await db()
    .update(authTokens)
    .set({ UsedAt: new Date() })
    .where(
      and(
        eq(authTokens.TokenHash, hash(token)),
        eq(authTokens.Kind, kind),
        isNull(authTokens.UsedAt),
        sql`${authTokens.ExpiresAt} > now()`
      )
    )
    .returning({ userId: authTokens.UserId });
  return rows[0]?.userId ?? null;
}
