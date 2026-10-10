import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { associationIdsFrom, decodeTicketClaims } from './realtime-ticket';

/** The gateway ticket is `base64url(json).base64url(hmac)`. */
function ticket(claims: unknown): string {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${body}.signature`;
}

describe('decodeTicketClaims', () => {
  it('reads the claims from the first segment', () => {
    const claims = decodeTicketClaims(
      ticket({ uid: 'u1', name: 'Ada', clubs: ['c1'], assocs: ['a1', 'a2'] })
    );
    assert.ok(claims);
    assert.equal(claims.uid, 'u1');
    assert.deepEqual(claims.assocs, ['a1', 'a2']);
  });

  it('returns null for a malformed ticket', () => {
    assert.equal(decodeTicketClaims(''), null);
    assert.equal(decodeTicketClaims('not-base64!!.sig'), null);
  });
});

describe('associationIdsFrom', () => {
  it('dedupes and drops non-strings', () => {
    const t = ticket({ assocs: ['a1', 'a1', 7, '', 'a2'] });
    assert.deepEqual(associationIdsFrom(t), ['a1', 'a2']);
  });

  it('is empty when the claim is absent', () => {
    assert.deepEqual(associationIdsFrom(ticket({ uid: 'u1' })), []);
    assert.deepEqual(associationIdsFrom(''), []);
  });
});
