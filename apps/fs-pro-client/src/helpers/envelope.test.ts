import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isOk, payloadOrNull, unwrapPayload } from './envelope';

const ok = (payload: unknown) => ({ status: 200, body: { success: true, message: 'OK', payload } });
const fail = (status: number, message: string) => ({ status, body: { success: false, message } });

describe('envelope', () => {
  it('unwraps an OK payload', () => {
    assert.equal(unwrapPayload<{ a: number }>(ok({ a: 1 })).a, 1);
    assert.equal(isOk(ok({})), true);
  });

  it('throws the server message on failure', () => {
    assert.throws(() => unwrapPayload(fail(409, 'Already claimed')), /Already claimed/);
  });

  it('treats a failure as null when soft-reading', () => {
    assert.equal(payloadOrNull(fail(404, 'nope')), null);
    assert.deepEqual(payloadOrNull(ok({ a: 1 })), { a: 1 });
  });

  it('treats success:false as a failure even at 200', () => {
    assert.equal(isOk({ status: 200, body: { success: false, message: 'x' } }), false);
  });
});
