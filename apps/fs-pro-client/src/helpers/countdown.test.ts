import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  anchorCountdown,
  formatCountdown,
  formatRemaining,
  remainingMs,
} from './countdown';

// A fixed server clock; nothing here reads the device clock.
const SERVER = '2026-10-10T12:00:00.000Z';
const serverMs = Date.parse(SERVER);
const plus = (ms: number) => new Date(serverMs + ms).toISOString();

describe('formatRemaining', () => {
  it('reads "ready" at exactly zero and in the past', () => {
    assert.equal(formatRemaining(0), 'ready');
    assert.equal(formatRemaining(-1), 'ready');
    assert.equal(formatRemaining(-86_400_000), 'ready');
  });

  it('renders seconds only under a minute', () => {
    assert.equal(formatRemaining(45_000), '45s');
    assert.equal(formatRemaining(1_000), '1s');
    // Rounds up, so a sub-second remainder never displays as "ready" early.
    assert.equal(formatRemaining(500), '1s');
  });

  it('renders minutes', () => {
    assert.equal(formatRemaining(12 * 60_000), '12m');
  });

  it('renders hours, dropping a zero minute', () => {
    assert.equal(formatRemaining(3 * 3_600_000 + 12 * 60_000), '3h 12m');
    assert.equal(formatRemaining(2 * 3_600_000), '2h');
  });

  it('renders days, dropping a zero hour', () => {
    assert.equal(formatRemaining(2 * 86_400_000 + 4 * 3_600_000), '2d 4h');
    assert.equal(formatRemaining(18 * 86_400_000), '18d');
  });
});

describe('anchorCountdown / remainingMs', () => {
  it('anchors the remainder to the server clock', () => {
    const anchor = anchorCountdown(plus(45_000), SERVER);
    assert.equal(anchor?.remainingAtSyncMs, 45_000);
    assert.equal(formatRemaining(remainingMs(anchor, 0)), '45s');
  });

  it('subtracts only the local elapsed delta', () => {
    const anchor = anchorCountdown(plus(3 * 3_600_000 + 12 * 60_000), SERVER);
    assert.equal(formatRemaining(remainingMs(anchor, 12 * 60_000)), '3h');
  });

  it('clamps at zero past the deadline', () => {
    const anchor = anchorCountdown(plus(30_000), SERVER);
    assert.equal(remainingMs(anchor, 999_999), 0);
  });

  it('treats a negative elapsed as zero', () => {
    const anchor = anchorCountdown(plus(60_000), SERVER);
    assert.equal(remainingMs(anchor, -5_000), 60_000);
  });

  it('returns null while the sample is missing or invalid', () => {
    assert.equal(anchorCountdown(null, SERVER), null);
    assert.equal(anchorCountdown(plus(1_000), null), null);
    assert.equal(anchorCountdown('not-a-date', SERVER), null);
    assert.equal(anchorCountdown(Number.NaN, SERVER), null);
  });
});

describe('formatCountdown (one-shot)', () => {
  it('is "ready" at exactly zero and in the past', () => {
    assert.equal(formatCountdown(SERVER, SERVER), 'ready');
    assert.equal(formatCountdown(plus(-1), SERVER), 'ready');
  });

  it('formats seconds, hours+minutes and day+hour samples', () => {
    assert.equal(formatCountdown(plus(45_000), SERVER), '45s');
    assert.equal(
      formatCountdown(plus(3 * 3_600_000 + 12 * 60_000), SERVER),
      '3h 12m'
    );
    assert.equal(
      formatCountdown(plus(2 * 86_400_000 + 4 * 3_600_000), SERVER),
      '2d 4h'
    );
    assert.equal(formatCountdown(plus(18 * 86_400_000), SERVER), '18d');
  });

  it('is empty until the sample lands', () => {
    assert.equal(formatCountdown(null, SERVER), '');
    assert.equal(formatCountdown(SERVER, ''), '');
  });
});
