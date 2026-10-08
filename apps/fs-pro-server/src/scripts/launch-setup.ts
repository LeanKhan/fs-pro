import 'dotenv/config';
import { eq, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../db/drizzle';
import { calendars, users } from '../db/drizzle/schema';
import { hashPassword } from '../utils/auth';
import { uniqueUsername, usernameFromEmail } from '../utils/launch-setup';
import { ensureWorldCompetitions } from '../services/competitions/world-competitions.service';

/**
 * `launch-setup` (phase-1 B5A): put a fresh world into a launchable state,
 * idempotently. It:
 *   1. creates or promotes the admin identified by email,
 *   2. sets the world clock to `live`,
 *   3. seeds the standing competitions (the Amateur Cup with an open edition).
 *
 * Safe to re-run: a second run promotes/promotes-nothing, re-sets the same
 * clock mode, and `ensureWorldCompetitions` never edits an existing
 * competition.
 *
 *   ADMIN_EMAIL=you@example.com \
 *   npx ts-node --transpile-only src/scripts/launch-setup.ts
 *
 * Env: ADMIN_EMAIL (required), ADMIN_PASSWORD, ADMIN_USERNAME, ADMIN_FULLNAME.
 */

export interface LaunchSetupOptions {
  email: string;
  password?: string;
  username?: string;
  fullName?: string;
}

export interface LaunchSetupResult {
  userId: string;
  created: boolean;
  promoted: boolean;
  clockMode: 'live';
  amateurCup: { competitionId: string; created: boolean; edition: string | null };
}

export async function runLaunchSetup(opts: LaunchSetupOptions): Promise<LaunchSetupResult> {
  const email = opts.email.trim();
  if (!email || !email.includes('@')) throw new Error('ADMIN_EMAIL must be a valid email');
  const emailLower = email.toLowerCase();
  const db = DrizzleDatabase.getInstance().database;

  // 1. Admin: find by email (case-insensitive), else by username.
  const existing = await db
    .select({ id: users.id, isAdmin: users.isAdmin, username: users.Username })
    .from(users)
    .where(sql`lower(${users.Email}) = ${emailLower} OR lower(${users.Username}) = ${emailLower}`)
    .limit(1);

  let userId: string;
  let created = false;
  let promoted = false;
  if (existing.length) {
    userId = existing[0].id;
    if (!existing[0].isAdmin) {
      await db.update(users).set({ isAdmin: true }).where(eq(users.id, userId));
      promoted = true;
    }
  } else {
    const taken = await db.select({ u: users.Username }).from(users);
    const username = uniqueUsername(opts.username?.trim() || usernameFromEmail(email), taken.map((t) => t.u));
    const password = opts.password || Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const inserted = await db
      .insert(users)
      .values({
        FullName: opts.fullName?.trim() || username,
        Username: username,
        Email: email,
        Password: await hashPassword(password),
        isAdmin: true,
        updatedAt: new Date(),
      })
      .returning({ id: users.id });
    userId = inserted[0].id;
    created = true;
    // The generated password is only meaningful the first time; print it once.
    console.log(`[launch-setup] created admin ${username} <${email}> password: ${password}`);
    console.log('[launch-setup] change this password after first login (or pass ADMIN_PASSWORD).');
  }

  // 2. World clock live.
  await db.update(calendars).set({ ClockMode: 'live' });

  // 3. Standing competitions (Amateur Cup + pyramid), idempotent.
  const comps = await ensureWorldCompetitions();

  return {
    userId,
    created,
    promoted,
    clockMode: 'live',
    amateurCup: {
      competitionId: comps.amateurCup.competitionId,
      created: comps.amateurCup.created,
      edition: comps.amateurCup.edition ?? null,
    },
  };
}

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim();
  if (!email) {
    console.error('Set ADMIN_EMAIL (and optionally ADMIN_PASSWORD, ADMIN_USERNAME, ADMIN_FULLNAME).');
    process.exit(1);
  }
  const result = await runLaunchSetup({
    email,
    password: process.env.ADMIN_PASSWORD?.trim() || undefined,
    username: process.env.ADMIN_USERNAME?.trim() || undefined,
    fullName: process.env.ADMIN_FULLNAME?.trim() || undefined,
  });
  console.log(
    `[launch-setup] admin=${result.userId} created=${result.created} promoted=${result.promoted} ` +
      `clock=${result.clockMode} amateurCup=${result.amateurCup.competitionId} ` +
      `created=${result.amateurCup.created} edition=${result.amateurCup.edition ?? 'live'}`
  );
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[launch-setup] failed:', err);
    process.exit(1);
  });
}
