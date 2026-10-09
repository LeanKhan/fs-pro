import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as Sentry from '@sentry/node';
import { captureException, errorTrackingEnabled, initErrorTracking } from '../src/helpers/error-tracking';

/**
 * Error tracking is DSN-gated (Batch 5B): with no SENTRY_DSN it must be a
 * complete no-op, so local dev and CI need no Sentry account.
 */
describe('error tracking', () => {
  const original = process.env.SENTRY_DSN;

  afterEach(() => {
    if (original === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = original;
  });

  afterAll(async () => {
    // Sentry keeps a transport (and timers) open once initialised.
    await Sentry.close(0);
  });

  it('is disabled and silent without SENTRY_DSN', () => {
    delete process.env.SENTRY_DSN;
    expect(initErrorTracking()).toBe(false);
    expect(errorTrackingEnabled()).toBe(false);
    expect(() => captureException(new Error('ignored'))).not.toThrow();
  });

  it('initialises when SENTRY_DSN is set', () => {
    process.env.SENTRY_DSN = 'https://publickey@example.invalid/1';
    expect(initErrorTracking()).toBe(true);
    expect(errorTrackingEnabled()).toBe(true);
  });
});
