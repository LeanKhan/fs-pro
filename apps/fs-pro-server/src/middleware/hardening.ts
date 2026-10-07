import type { Application, Request, RequestHandler } from 'express';
import helmet from 'helmet';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../db/drizzle';

/**
 * Production hardening: security headers, rate limits on the routes bots
 * hit first, and a health check for the container orchestrator.
 *
 * Limits are counted per process in memory. With several server instances
 * each keeps its own count, so the effective limit is a little looser; move
 * the store to Redis/Postgres if that ever matters. The client IP comes from
 * `trust proxy` (TRUST_PROXY in server.ts) - set it to the number of proxies
 * in front of the server, or every player shares one address.
 *
 * RATE_LIMIT=off disables all limits (local load tests only).
 */

const off = () => process.env.RATE_LIMIT?.trim() === 'off';
const MINUTE = 60_000;

const tooMany = (what: string) => ({
  success: false,
  message: `Too many ${what}. Please wait a few minutes and try again.`,
});

const ipOf = (req: Request) => ipKeyGenerator(req.ip ?? '');

function limiter(opts: {
  windowMs: number;
  limit: number;
  what: string;
  key?: (req: Request) => string;
  skipPath?: RegExp;
}): RequestHandler {
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => off() || !!opts.skipPath?.test(req.path),
    keyGenerator: opts.key ?? ipOf,
    handler: (_req, res) => res.status(429).json(tooMany(opts.what)),
  });
}

/** Per-username key, so a botnet can't guess one account's password from many IPs. */
const usernameKey = (req: Request) => `u:${String((req.body as { Username?: unknown } | undefined)?.Username ?? '').toLowerCase().slice(0, 64)}`;

/** Health check: the process is up and the database answers. No session, no auth. */
export function registerHealthCheck(app: Application) {
  app.disable('x-powered-by');
  app.get('/healthz', async (_req, res) => {
    try {
      await DrizzleDatabase.getInstance().database.execute(sql`select 1`);
      res.status(200).json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });
}

/** Headers for the API. The client's own headers come from nginx (deploy/nginx.conf.template). */
export function securityHeaders(): RequestHandler {
  return helmet({
    // The API serves images and SVGs (crests, kits) that the client page, on
    // another origin in some setups, embeds.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // Swagger UI (dev only) needs inline scripts; the API itself returns JSON.
    contentSecurityPolicy: process.env.ENABLE_API_DOCS === 'true' ? false : undefined,
  });
}

/** Mount after the body parsers and before the routers. */
export function registerRateLimits(app: Application) {
  // Bots go for these first.
  app.use('/api/users/login', limiter({ windowMs: 15 * MINUTE, limit: 20, what: 'login attempts' }));
  app.use('/api/users/login', limiter({ windowMs: 15 * MINUTE, limit: 8, what: 'login attempts for this account', key: usernameKey }));
  app.use('/api/users/join', limiter({ windowMs: 60 * MINUTE, limit: 5, what: 'sign-ups from this address' }));
  app.use('/api/users/change-password', limiter({ windowMs: 15 * MINUTE, limit: 10, what: 'password changes' }));
  app.use('/api/auth', limiter({ windowMs: 15 * MINUTE, limit: 60, what: 'sign-in requests' }));
  // Founding a club creates players and rows in several tables.
  app.use('/api/atlas/clubs', limiter({ windowMs: 60 * MINUTE, limit: 10, what: 'club foundings' }));
  // Everything else: generous for a person, a wall for a script.
  // Crest and kit images are fetched by the dozen on the world views.
  app.use('/api', limiter({ windowMs: MINUTE, limit: 600, what: 'requests', skipPath: /^\/(crests|kits)\// }));
}
