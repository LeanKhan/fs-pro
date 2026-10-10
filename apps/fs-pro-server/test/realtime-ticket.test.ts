import { describe, expect, it } from 'vitest';
import { associationIdsFrom, issueTicket } from '../src/realtime/world-events';

/**
 * The gateway (apps/fs-pro-realtime) trusts the ticket's claims and never reads
 * the database, so the Node signer is the only place the `assocs` claim can be
 * produced. Without it `association:<id>` is fail-closed (hub.go `CanJoin`),
 * which is the exact P7 gap this pins.
 */

/** Reverse of `issueTicket`: `<base64url(json)>.<base64url(hmac)>`. */
function decodeClaims(ticket: string): Record<string, unknown> {
  const [payload] = ticket.split('.');
  if (!payload) throw new Error(`not a ticket: ${ticket}`);
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
}

describe('issueTicket', () => {
  it('keeps the existing claim shape (uid, name, clubs, code, ver, exp)', () => {
    const claims = decodeClaims(issueTicket({ uid: 'u1', name: 'Ada', clubs: ['c1', 'c2'], code: 'ADA', ver: true, admin: true }));
    expect(claims).toMatchObject({ uid: 'u1', name: 'Ada', clubs: ['c1', 'c2'], code: 'ADA', ver: true, admin: true });
    expect(typeof claims.exp).toBe('number');
    // A club owner with no association stays exactly as before.
    expect(claims).not.toHaveProperty('assocs');
  });

  it('emits the assocs claim the gateway scopes association rooms off', () => {
    const claims = decodeClaims(
      issueTicket({ uid: 'u1', name: 'Ada', clubs: ['c1'], assocs: ['a2', 'a1'], code: 'ADA' })
    );
    expect(claims.assocs).toEqual(['a2', 'a1']);
    // The association claim is additive: every pre-existing claim survives.
    expect(claims).toMatchObject({ uid: 'u1', name: 'Ada', clubs: ['c1'], code: 'ADA' });
  });

  it('omits assocs for a clubless user (no spurious empty claim)', () => {
    const claims = decodeClaims(issueTicket({ uid: 'u', name: 'Nomad', clubs: [] }));
    expect(claims).not.toHaveProperty('assocs');
  });

  it('is signed: a tampered payload no longer matches the signature', () => {
    const ticket = issueTicket({ uid: 'u1', name: 'Ada', clubs: [], assocs: ['a1'] });
    const [payload, signature] = ticket.split('.');
    const forged = Buffer.from(JSON.stringify({ uid: 'u1', name: 'Ada', clubs: [], assocs: ['other'] })).toString('base64url');
    expect(forged).not.toBe(payload);
    // The signature is over the original payload; swapping the payload breaks it.
    expect(`${forged}.${signature}`).not.toBe(ticket);
  });
});

describe('associationIdsFrom', () => {
  it('dedupes, sorts and drops empty or non-string AssociationId', () => {
    expect(
      associationIdsFrom([
        { AssociationId: 'b2' },
        { AssociationId: 'a1' },
        { AssociationId: 'b2' },
        { AssociationId: '  a1  ' },
        { AssociationId: '' },
        { AssociationId: '   ' },
        { AssociationId: null },
        { AssociationId: 42 },
        {},
      ])
    ).toEqual(['a1', 'b2']);
  });

  it('returns an empty list for no memberships', () => {
    expect(associationIdsFrom([])).toEqual([]);
  });
});
