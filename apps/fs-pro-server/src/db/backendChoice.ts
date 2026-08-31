import fs from 'fs';
import path from 'path';

export type BackendChoice = 'mongo' | 'drizzle' | 'prisma';

const VALID: BackendChoice[] = ['mongo', 'drizzle', 'prisma'];

/**
 * Persisted override for which DB backend to boot with - written by
 * `POST /api/meta/db/backend` (see controllers/meta/meta.router.ts) so a
 * process restart comes back up on the newly-chosen backend instead of
 * whatever `USE_POSTGRESQL`/`USE_DRIZZLE` says in `.env`. Kept as its own
 * small file rather than rewriting `.env` directly, so switching backends
 * for testing never risks corrupting real secrets - delete this file (or
 * call `DELETE /api/meta/db/backend`) to fall back to `.env` again.
 *
 * Deliberately file-based, not in-memory: the whole point is surviving a
 * process restart, which is how backend switching actually happens now
 * (see the comment on `db/index.ts`'s `resolveBackend()` for why an
 * in-process hot-swap was abandoned).
 */
const STATE_FILE = path.join(__dirname, '../../.db-backend.json');

export function readPersistedBackend(): BackendChoice | null {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as { backend?: string };
    if (parsed.backend && (VALID as string[]).includes(parsed.backend)) {
      return parsed.backend as BackendChoice;
    }
  } catch {
    // No override file yet, or it's malformed - fall back to .env.
  }
  return null;
}

export function persistBackend(backend: BackendChoice): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify({ backend }, null, 2));
}

export function clearPersistedBackend(): void {
  try {
    fs.unlinkSync(STATE_FILE);
  } catch {
    // Already gone.
  }
}

export function isValidBackend(value: unknown): value is BackendChoice {
  return typeof value === 'string' && (VALID as string[]).includes(value);
}

export function resolveBackend(): BackendChoice {
  const persisted = readPersistedBackend();
  if (persisted) return persisted;

  const usePostgresql = process.env.USE_POSTGRESQL?.trim() === 'true';
  const useDrizzle = process.env.USE_DRIZZLE?.trim() === 'true';

  if (!usePostgresql) return 'mongo';
  return useDrizzle ? 'drizzle' : 'prisma';
}
