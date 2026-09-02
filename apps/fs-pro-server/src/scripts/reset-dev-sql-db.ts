import * as dotenv from 'dotenv';
dotenv.config();

import * as readline from 'readline';
import { createDrizzleConnection } from '../db/drizzle/client';

const DEV_NODE_ENVS = new Set(['dev', 'development', 'test']);
const TABLES = [
  'Awards',
  'PlayerMatchDetails',
  'ClubMatchDetails',
  'MatchReplays',
  'Fixtures',
  'Players',
  'Seasons',
  'Days',
  'Calendars',
  'CompetitionClubs',
  'Clubs',
  'Competitions',
  'Managers',
  'Users',
  'Places',
];

type MutedReadline = readline.Interface & {
  stdoutMuted?: boolean;
  _writeToOutput?: (stringToWrite: string) => void;
};

function isDevRuntime() {
  return (
    DEV_NODE_ENVS.has((process.env.NODE_ENV || '').trim().toLowerCase()) ||
    Boolean(process.env.DEV_TEST)
  );
}

function isLocalDatabaseUrl(databaseUrl: string) {
  const url = new URL(databaseUrl);
  return ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
}

function askHidden(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  }) as MutedReadline;

  const writeToOutput = rl._writeToOutput?.bind(rl);
  rl._writeToOutput = (stringToWrite: string) => {
    if (
      !rl.stdoutMuted ||
      stringToWrite.includes('\n') ||
      stringToWrite.includes('\r')
    ) {
      writeToOutput?.(stringToWrite);
      return;
    }

    writeToOutput?.('*');
  };

  return new Promise((resolve) => {
    rl.stdoutMuted = true;
    rl.question(question, (answer) => {
      rl.stdoutMuted = false;
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function resetDevSqlDb() {
  const databaseUrl = process.env.DATABASE_URL;
  const expectedPassword = process.env.DEV_DB_RESET_PASSWORD;

  if (!isDevRuntime()) {
    throw new Error(
      'Refusing to reset SQL DB: NODE_ENV must be dev/development/test or DEV_TEST must be set.'
    );
  }

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required.');
  }

  if (!isLocalDatabaseUrl(databaseUrl)) {
    throw new Error(
      'Refusing to reset SQL DB: DATABASE_URL must point to localhost, 127.0.0.1, or ::1.'
    );
  }

  if (!expectedPassword) {
    throw new Error(
      'DEV_DB_RESET_PASSWORD is required before this destructive dev-only script can run.'
    );
  }

  console.log(
    'This will delete all application data from the local development SQL database.'
  );
  console.log(
    `Target: ${new URL(databaseUrl).host}${new URL(databaseUrl).pathname}`
  );

  const password = await askHidden('Password: ');
  if (password !== expectedPassword) {
    throw new Error('Incorrect password. No data was deleted.');
  }

  const { client } = createDrizzleConnection();

  try {
    await client`SELECT 1`;
    const existingTables = await client<{ tablename: string }[]>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename = ANY(${TABLES})
    `;

    if (existingTables.length === 0) {
      console.log('No application tables found to reset.');
      return;
    }

    await client.unsafe(
      `TRUNCATE TABLE ${existingTables
        .map(({ tablename }) => `"${tablename.replace(/"/g, '""')}"`)
        .join(', ')} RESTART IDENTITY CASCADE`
    );
    console.log('Development SQL database reset complete.');
  } finally {
    await client.end();
  }
}

resetDevSqlDb().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
