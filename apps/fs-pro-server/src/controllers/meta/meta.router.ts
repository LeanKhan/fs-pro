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
 * 'User (partial)': identity-only routes (login, fetch-by-id,
 * change-password, update, logout, /enter) plus all the club-ownership
 * routes (/add-club(s), /clubs/:id, populate=true) go through repositories
 * now - ownership reads/writes go through `ClubRepository`'s `Clubs.User`
 * reverse FK instead of the old `Users.Clubs` array, which Postgres never
 * had. Only registration's user-creation step is still fully raw Mongo.
 * See FUTURE-PLANS.md for the full writeup.
 *
 * 'Manager (partial)': fetch/create/update/`populate=Club`/DELETE (incl.
 * `resolveManagerTactic`, used on every match kickoff) all go through the
 * repository now, including the delete itself (`IManagerRepository.delete`)
 * - closed a real gap where deleting a Postgres-native manager under
 * `backend=drizzle` used to fail after already clearing the club's Manager
 * field.
 *
 * 'Club (partial)': fetch-by-id (no populate)/create/update (plain
 * fields)/delete go through the repository, as does every Manager
 * hire/fire/removal write via `appendClubRecord` (a read-modify-write
 * replacement for the old `$push`/`$unset` operator updates), `GET
 * /clubs/all` (now with `Players`/`Manager` populated via the repository),
 * and add/remove/add-many-player (writes `Player.Club`/`ClubCode` via the
 * Player repository - `Club.Players` doesn't exist on Postgres - and the
 * ratings recalculation, via a SQL `GROUP BY` replacing the old
 * `$lookup`/`$group` aggregate). `/clubs/fetch`'s arbitrary Mongo query
 * object and the CSV bulk import stay raw.
 *
 * 'Competition (partial)': fetch-by-id (populate=false only)/create/update
 * (plain fields)/delete go through the repository. The default
 * populate=true (Clubs/Seasons) and the Club/Season membership routes
 * (add-club, add-season) stay raw - `Competition.Clubs` maps to two
 * different mechanisms on Postgres depending on competition type (a club's
 * `League` FK, or the `competitionClubs` join table for cups/tournaments),
 * which needs real branching logic, not a mechanical conversion.
 *
 * 'Calendar (partial)': fetch-by-id/fetch-all/create/update (plain
 * fields)/delete go through the repository (used by `POST /calendar/new`
 * and `POST /:id/end`'s isActive/isEnded write). The Days-array-building
 * game loop (`setup-and-start`, `setup-days-and-start`, `startYear`'s
 * aggregation-pipeline multi-row update) stays raw. Day itself has no
 * repository at all yet - its real read path (`GET /:year/days`) needs
 * `Matches.Fixture` populate; Fixture is converted now, but nobody's built
 * Day on top of it yet.
 *
 * 'Player (partial)': fetch-by-id/create/update (plain fields)/delete go
 * through the repository, as does `toggleSigned`/`signManyPlayersToClub`
 * (add/remove player to/from a club - the actual Postgres-side ownership
 * write, since `players.Club` is a direct column there). `GET /all`
 * (arbitrary query), bulk `update-many`, the aggregate-pipeline stats
 * endpoints (`/stats`), and end-of-year rating/age progression (operator
 * updates) stay raw.
 *
 * 'Fixture (partial)': fetch-by-id (no extra populate)/create/update
 * (plain fields)/delete go through the repository - `findById` always
 * comes with `HomeSideDetails`/`AwaySideDetails` (each with `PlayerStats`)
 * populated, matching the raw path's own default. An explicit
 * `?populate=` path, and the arbitrary-query `findOneAndUpdate` the match
 * engine uses throughout to record match state, stay raw.
 *
 * 'Season (partial)': fetch-by-id (no extra populate)/create/update (plain
 * fields)/delete go through the repository - `findById` always comes with
 * `Fixtures` populated (matching the raw path's own default), and
 * `PATCH /:id/start`'s isolated `{ isStarted, StartDate }` write is
 * converted too. `GET /`'s arbitrary query/populate/select/sort combo, and
 * the fixture-generation/standings/prolegation game loop
 * (`middleware/seasons.ts`, `season.controller.ts`) - all plain-field
 * writes, but deep, interdependent game-loop internals - stay raw.
 */
const CONVERTED_ENTITIES = [
  'Place',
  'User (partial)',
  'Manager (partial)',
  'Club (partial)',
  'Competition (partial)',
  'Calendar (partial)',
  'Player (partial)',
  'Fixture (partial)',
  'Season (partial)',
];

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
