import { Router } from 'express';
import DB from '../../db';
import {
  BackendChoice,
  isValidBackend,
  persistBackend,
  clearPersistedBackend,
  readPersistedBackend,
} from '../../db/backendChoice';
import respond from '../../helpers/responseHandler';

const router = Router();

const VALID_BACKENDS: BackendChoice[] = ['mongo', 'drizzle', 'prisma'];

/**
 * Entities with a real repository (Mongo + Drizzle implementations) reached
 * by at least some of their routes - everything else still reads/writes
 * through `DB.Models.X` directly and, while `backend` is `drizzle`,
 * transparently falls back to a live Mongo connection (see
 * `db/drizzle/index.ts`) rather than actually touching Postgres. Update
 * this list as each entity gets converted (see FUTURE-PLANS.md).
 *
 * 'User (partial)': only the identity-only routes (login, fetch-by-id,
 * change-password, update, logout, /enter) go through the repository.
 * Registration's user-creation and the `User.Clubs`-array routes
 * (/add-club(s), /clubs/:id, GET /:id?populate=true) are still fully raw
 * Mongo - not because Club is unconverted (it now partially is), but
 * because Postgres dropped `Users.Clubs` entirely in favor of `Clubs.User`
 * (the reverse FK) - there's no array left to keep in sync on that backend.
 * See FUTURE-PLANS.md for the full writeup.
 *
 * 'Manager (partial)': fetch/create/update/`populate=Club` (incl.
 * `resolveManagerTactic`, used on every match kickoff) go through the
 * repository. DELETE stays raw for the Manager-side write, but its
 * Club-side write (`Club.Manager` unset) now goes through the Club
 * repository too.
 *
 * 'Club (partial)': fetch-by-id (no populate)/create/update (plain fields
 * only) go through the repository, as does every Manager
 * hire/fire/removal write via `appendClubRecord` (a read-modify-write
 * replacement for the old `$push`/`$unset` operator updates). GET
 * /clubs/all, /clubs/fetch, arbitrary-populate fetches, add/remove-player,
 * and the CSV bulk import stay raw - they need either Mongo operators the
 * repository doesn't support, or Player data (Player isn't converted).
 */
const CONVERTED_ENTITIES = ['Place', 'User (partial)', 'Manager (partial)', 'Club (partial)'];

/**
 * @openapi
 * /meta/db:
 *   get:
 *     tags: [Meta]
 *     summary: Current database backend status
 *     description: >
 *       Shows which backend this process actually booted with, and whether
 *       a different choice is persisted for the *next* restart (see
 *       POST /meta/db/backend). Only entities listed in `convertedEntities`
 *       are genuinely reading/writing that backend - everything else falls
 *       back to Mongo regardless of `backend`, mid-migration.
 *     responses:
 *       200:
 *         description: OK
 */
router.get('/db', (req, res) => {
  const pending = readPersistedBackend();

  respond.success(res, 200, 'Database status fetched successfully', {
    backend: DB.backend,
    ormType: DB.ormType,
    databaseType: DB.databaseType,
    convertedEntities: CONVERTED_ENTITIES,
    pendingBackend: pending && pending !== DB.backend ? pending : null,
  });
});

/**
 * @openapi
 * /meta/db/backend:
 *   post:
 *     tags: [Meta]
 *     summary: Set which database backend the NEXT restart should use (dev/testing only)
 *     description: >
 *       Persists the chosen backend to a small state file. Does NOT restart
 *       the process itself and does NOT hot-swap the backend in place - both
 *       were tried and reverted. Hot-swapping broke because Mongoose's model
 *       registry is global: reconstructing the Mongo connection a second
 *       time in the same process throws `OverwriteModelError` for any model
 *       without an explicit re-registration guard. Self-triggering a
 *       restart was also tried (`process.exit()`) and doesn't reliably come
 *       back up: `ts-node-dev --respawn` only respawns on a *file-change*
 *       event, not a plain process exit, and that'd be even less
 *       predictable under nodemon/PM2/plain `node`. So: after calling this,
 *       restart the server yourself (Ctrl+C, then re-run it) - it'll boot
 *       into whatever backend you set here.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [backend]
 *             properties:
 *               backend:
 *                 type: string
 *                 enum: [mongo, drizzle, prisma]
 *     responses:
 *       200:
 *         description: Persisted - restart the server manually to apply it
 *       400:
 *         description: Invalid backend name
 */
router.post('/db/backend', (req, res) => {
  const backend = req.body?.backend as unknown;

  if (!isValidBackend(backend)) {
    return respond.fail(
      res,
      400,
      `backend must be one of: ${VALID_BACKENDS.join(', ')}`
    );
  }

  persistBackend(backend);

  respond.success(
    res,
    200,
    `Backend set to ${backend} for the next restart - stop and re-run the server to apply it`,
    { backend, currentBackend: DB.backend }
  );
});

/**
 * @openapi
 * /meta/db/backend:
 *   delete:
 *     tags: [Meta]
 *     summary: Clear the persisted backend override (dev/testing only)
 *     description: >
 *       Removes the state file POST /meta/db/backend writes, so the next
 *       restart goes back to whatever USE_POSTGRESQL/USE_DRIZZLE says in
 *       `.env`. Does not restart the process - same as the POST route,
 *       restart manually to apply it.
 *     responses:
 *       200:
 *         description: Override cleared - restart the server manually to apply it
 */
router.delete('/db/backend', (req, res) => {
  clearPersistedBackend();

  respond.success(
    res,
    200,
    'Backend override cleared for the next restart - stop and re-run the server to apply it',
    { currentBackend: DB.backend }
  );
});

export default router;
