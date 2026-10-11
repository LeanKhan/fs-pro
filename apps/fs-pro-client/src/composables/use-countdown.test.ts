import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nextTick, ref } from 'vue';
import { useCountdown } from './use-countdown';

const SERVER = '2026-10-10T12:00:00.000Z';
const serverMs = Date.parse(SERVER);
const iso = (ms: number) => new Date(ms).toISOString();

describe('useCountdown', () => {
  it('derives the label from serverNow even when the device clock is wrong', () => {
    // The device believes it is ~400 days ahead of the server.
    let device = serverMs + 400 * 86_400_000;
    const cd = useCountdown(
      () => iso(serverMs + 3 * 3_600_000 + 12 * 60_000),
      () => SERVER,
      { now: () => device }
    );
    assert.equal(cd.label.value, '3h 12m');

    // Twelve real minutes pass; only the delta is applied, so the wrong
    // absolute device clock cancels out.
    device += 12 * 60_000;
    cd.tick();
    assert.equal(cd.label.value, '3h');
    assert.equal(cd.ready.value, false);
  });

  it('is ready at exactly zero and in the past', () => {
    const device = serverMs;
    const exactly = useCountdown(
      () => SERVER,
      () => SERVER,
      { now: () => device }
    );
    exactly.tick();
    assert.equal(exactly.ready.value, true);
    assert.equal(exactly.label.value, 'ready');

    const past = useCountdown(
      () => iso(serverMs - 60_000),
      () => SERVER,
      {
        now: () => device,
      }
    );
    past.tick();
    assert.equal(past.ready.value, true);
  });

  it('fires onDone exactly once when it crosses zero', () => {
    let device = serverMs;
    let doneCount = 0;
    const cd = useCountdown(
      () => iso(serverMs + 45_000),
      () => SERVER,
      {
        now: () => device,
        onDone: () => {
          doneCount += 1;
        },
      }
    );
    cd.tick();
    assert.equal(doneCount, 0);

    device += 45_000;
    cd.tick();
    assert.equal(cd.ready.value, true);
    assert.equal(doneCount, 1);

    device += 10_000;
    cd.tick();
    assert.equal(doneCount, 1);
  });

  it('re-anchors when the server sample changes', async () => {
    let device = serverMs;
    const serverNow = ref(SERVER);
    const at = ref(iso(serverMs + 60_000));
    const cd = useCountdown(at, serverNow, { now: () => device });
    assert.equal(cd.label.value, '1m');

    // A fresh read arrives 30s later: the server clock and the deadline move.
    device += 30_000;
    serverNow.value = iso(serverMs + 30_000);
    at.value = iso(serverMs + 30_000 + 60_000);
    await nextTick();
    assert.equal(cd.label.value, '1m');
  });

  it('is blank (and not ready) until the sample lands', () => {
    const at = ref<string | null>(null);
    const serverNow = ref<string | null>(null);
    const cd = useCountdown(at, serverNow, { now: () => serverMs });
    cd.tick();
    assert.equal(cd.label.value, '');
    assert.equal(cd.ready.value, false);
  });
});
