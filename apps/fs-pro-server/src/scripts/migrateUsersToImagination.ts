import * as dotenv from 'dotenv';
dotenv.config();

import { eq, isNull, and } from 'drizzle-orm';
import { DrizzleDatabase } from '../db/drizzle';
import { users } from '../db/drizzle/schema';

/**
 * Moves fs-pro users into imagination so they can sign in there.
 *
 *   ts-node src/scripts/migrateUsersToImagination.ts [--only <username>]
 *       Dry run (default): asks imagination what it WOULD do, writes nothing.
 *
 *   ts-node src/scripts/migrateUsersToImagination.ts --write --i-have-a-backup [--only <username>]
 *       Creates the accounts (with each user's existing bcrypt hash, so
 *       passwords keep working) and links Users.accountId.
 *
 * Idempotent: users already linked are skipped, and imagination keys imports
 * by the fs-pro user id, so re-running never duplicates anything. A username
 * that a different imagination account already holds is reported as a
 * conflict and the user is left on legacy login.
 *
 * Needs IMAGINATION_API_URL, IMAGINATION_CLIENT_ID and IMAGINATION_CLIENT_SECRET.
 */

const BATCH_SIZE = 100;

interface ImportResult {
  legacyId: string;
  status: 'created' | 'exists' | 'conflict' | 'invalid' | 'error';
  accountId?: string;
  message?: string;
}

async function serviceToken(apiUrl: string, clientId: string, secret: string): Promise<string> {
  const response = await fetch(`${apiUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: secret,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string };
  if (!response.ok || !body.access_token) {
    throw new Error(`Could not get a service token from imagination (${response.status})`);
  }
  return body.access_token;
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const onlyIndex = args.indexOf('--only');
  const only = onlyIndex >= 0 ? args[onlyIndex + 1] : undefined;

  if (write && !args.includes('--i-have-a-backup')) {
    throw new Error('Refusing to write without --i-have-a-backup. Back up the fs-pro database first.');
  }

  const apiUrl = (process.env.IMAGINATION_API_URL?.trim() || 'http://127.0.0.1:3003/api').replace(/\/+$/, '');
  const clientId = process.env.IMAGINATION_CLIENT_ID?.trim() || 'fs-pro';
  const secret = process.env.IMAGINATION_CLIENT_SECRET?.trim();
  if (!secret) throw new Error('IMAGINATION_CLIENT_SECRET is not set');

  const db = DrizzleDatabase.getInstance().database;
  const pending = await db
    .select()
    .from(users)
    .where(only ? and(isNull(users.accountId), eq(users.Username, only)) : isNull(users.accountId));

  console.log(
    `${write ? 'WRITE' : 'DRY RUN'}: ${pending.length} user(s) not yet on imagination` +
      (only ? ` (only "${only}")` : '') +
      '.'
  );
  if (!pending.length) {
    process.exit(0);
  }

  const token = await serviceToken(apiUrl, clientId, secret);
  const tally: Record<string, number> = {};
  const problems: string[] = [];

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const response = await fetch(`${apiUrl}/auth/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        dryRun: !write,
        accounts: batch.map((u) => ({
          legacyId: u.id,
          username: u.Username,
          displayName: u.FullName,
          passwordHash: u.Password,
        })),
      }),
    });
    if (!response.ok) {
      throw new Error(`Import request failed (${response.status}): ${await response.text()}`);
    }
    const { results } = (await response.json()) as { results: ImportResult[] };
    const byLegacyId = new Map(batch.map((u) => [u.id, u]));

    for (const result of results) {
      tally[result.status] = (tally[result.status] ?? 0) + 1;
      const user = byLegacyId.get(result.legacyId);
      if ((result.status === 'conflict' || result.status === 'invalid' || result.status === 'error') && user) {
        problems.push(`  ${result.status.padEnd(8)} ${user.Username} - ${result.message ?? ''}`);
      }
      if (write && user && result.accountId && (result.status === 'created' || result.status === 'exists')) {
        await db.update(users).set({ accountId: result.accountId, updatedAt: new Date() }).where(eq(users.id, user.id));
      }
    }
  }

  console.log('Result:', tally);
  if (problems.length) {
    console.log('Needs attention (these users stay on legacy login):');
    problems.forEach((line) => console.log(line));
  }
  if (!write) console.log('Dry run only - nothing was written. Re-run with --write --i-have-a-backup to apply.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
