import * as Sentry from '@sentry/node';
import type { Application } from 'express';
import log from './logger';

/**
 * Error tracking (Batch 5B). Sentry is the project's chosen provider; the DSN
 * is supplied per environment via SENTRY_DSN. When it is unset (local dev, CI)
 * this is a no-op, so no account or key is needed to run or test the server.
 *
 * The SDK API here is verified against @sentry/node v8.55:
 * `Sentry.init({ dsn, environment, release, tracesSampleRate })` and
 * `Sentry.setupExpressErrorHandler(app)` (registered after the routes).
 */

let enabled = false;

/** Initialise Sentry if SENTRY_DSN is configured. Returns whether tracking is
 * on. Safe to call once at startup. */
export function initErrorTracking(): boolean {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) {
    log('[error-tracking] SENTRY_DSN not set - Sentry disabled');
    return false;
  }
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV?.trim() || 'dev',
    release: process.env.SENTRY_RELEASE?.trim() || undefined,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0') || 0,
  });
  enabled = true;
  return true;
}

/** Register the Express error handler. Must be called AFTER all routes; a
 * no-op when Sentry was not initialised. */
export function setupErrorTracking(app: Application): void {
  Sentry.setupExpressErrorHandler(app);
}

/** Report an exception when tracking is on (otherwise a no-op). */
export function captureException(err: unknown): void {
  if (enabled) Sentry.captureException(err);
}

/** Whether Sentry is active in this process. */
export function errorTrackingEnabled(): boolean {
  return enabled;
}
