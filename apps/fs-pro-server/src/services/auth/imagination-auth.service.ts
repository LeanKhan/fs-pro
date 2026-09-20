import crypto from 'crypto';
import {
  createUser,
  getUserByAccountId,
  getUserByUsername,
} from '../../controllers/user/user.service';
import type { IUser } from '../../controllers/user/user.model';

/**
 * fs-pro signs users in through imagination (the world service) using the
 * OAuth 2.0 authorization-code flow with PKCE:
 *
 *   browser -> fs-pro /api/auth/login -> imagination /oauth/authorize (login page)
 *           -> fs-pro /api/auth/callback?code -> token exchange (server to server)
 *           -> access token (RS256 JWT) verified against imagination's JWKS
 *           -> fs-pro's own express session, exactly as before.
 *
 * Verification uses Node's built-in crypto and the published JWKS, so no JWT
 * library is needed.
 */

export interface ImaginationAuthConfig {
  /** Base the BROWSER uses to reach imagination's API (login redirect), e.g. http://localhost:5173/api */
  publicUrl: string;
  /** Base this SERVER uses for token and JWKS calls, e.g. http://127.0.0.1:3003/api */
  apiUrl: string;
  /** The token `iss` to require - imagination's AUTH_ISSUER. */
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Where imagination sends the browser back to (registered there exactly). */
  callbackUrl: string;
  /** fs-pro's web client, where the user lands after login. */
  clientUrl: string;
  /** imagination's web app, for logging out there too. */
  webUrl: string;
}

const trimSlash = (url: string) => url.replace(/\/+$/, '');

export function imaginationConfig(): ImaginationAuthConfig | null {
  const clientSecret = process.env.IMAGINATION_CLIENT_SECRET?.trim();
  if (!clientSecret) return null;

  const webUrl = trimSlash(process.env.IMAGINATION_WEB_URL?.trim() || 'http://localhost:5173');
  const serverUrl = trimSlash(process.env.FSPRO_PUBLIC_URL?.trim() || 'http://localhost:3000');
  return {
    publicUrl: trimSlash(process.env.IMAGINATION_PUBLIC_URL?.trim() || `${webUrl}/api`),
    apiUrl: trimSlash(process.env.IMAGINATION_API_URL?.trim() || 'http://127.0.0.1:3003/api'),
    issuer: trimSlash(process.env.IMAGINATION_ISSUER?.trim() || `${webUrl}/api`),
    clientId: process.env.IMAGINATION_CLIENT_ID?.trim() || 'fs-pro',
    clientSecret,
    callbackUrl: `${serverUrl}/api/auth/callback`,
    clientUrl: trimSlash(process.env.FSPRO_CLIENT_URL?.trim() || 'http://localhost:8080'),
    webUrl,
  };
}

const b64url = (buffer: Buffer) => buffer.toString('base64url');

export function newPkcePair(): { verifier: string; challenge: string } {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function buildAuthorizeUrl(
  config: ImaginationAuthConfig,
  state: string,
  challenge: string
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${config.publicUrl}/oauth/authorize?${params.toString()}`;
}

export async function exchangeCode(
  config: ImaginationAuthConfig,
  code: string,
  verifier: string
): Promise<string> {
  const response = await fetch(`${config.apiUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.callbackUrl,
      code_verifier: verifier,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    error_description?: string;
  };
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description || `Token exchange failed (${response.status})`);
  }
  return body.access_token;
}

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
}

const JWKS_TTL_MS = 5 * 60 * 1000;
let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;

async function loadJwks(config: ImaginationAuthConfig, force = false): Promise<Jwk[]> {
  if (!force && jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const response = await fetch(`${config.apiUrl}/.well-known/jwks.json`);
  if (!response.ok) throw new Error(`Could not load imagination's signing keys (${response.status})`);
  const body = (await response.json()) as { keys: Jwk[] };
  jwksCache = { keys: body.keys, fetchedAt: Date.now() };
  return body.keys;
}

export interface AccessTokenClaims {
  sub: string;
  username: string;
  name: string;
  [claim: string]: unknown;
}

/**
 * Verifies an RS256 access token: signature against the JWKS key its header
 * names (re-fetching the key set once if the kid is unknown, which covers key
 * rotation), then issuer, audience, expiry and token type. Throws on any failure.
 */
export async function verifyAccessToken(
  config: ImaginationAuthConfig,
  token: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<AccessTokenClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed token');
  const [headerPart, payloadPart, signaturePart] = parts;

  const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8')) as {
    alg?: string;
    kid?: string;
  };
  if (header.alg !== 'RS256') throw new Error('Unsupported token algorithm');

  let jwk = (await loadJwks(config)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await loadJwks(config, true)).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Token signed by an unknown key');

  const publicKey = crypto.createPublicKey({ key: jwk as unknown as crypto.JsonWebKey, format: 'jwk' });
  const valid = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${headerPart}.${payloadPart}`),
    publicKey,
    Buffer.from(signaturePart, 'base64url')
  );
  if (!valid) throw new Error('Bad token signature');

  const claims = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as AccessTokenClaims & {
    iss?: string;
    aud?: string;
    exp?: number;
    typ?: string;
  };
  if (claims.iss !== config.issuer) throw new Error('Wrong token issuer');
  if (claims.aud !== config.clientId) throw new Error('Token was not issued for fs-pro');
  if (typeof claims.exp !== 'number' || nowSeconds >= claims.exp) throw new Error('Token expired');
  if (claims.typ !== 'access' || !claims.sub) throw new Error('Not a user access token');
  return claims;
}

/**
 * The local fs-pro user for an imagination account: the one already linked to
 * it (by the migration script), otherwise a fresh one.
 *
 * Accounts are deliberately NOT matched to existing users by username: anyone
 * could register that username at imagination first and take the fs-pro user
 * over. Existing users are linked only by the migration, which knows which
 * account it created for which user.
 */
export async function findOrCreateLocalUser(claims: AccessTokenClaims): Promise<IUser> {
  const existing = await getUserByAccountId(claims.sub);
  if (existing) return existing;

  // Local usernames are unique; on a clash keep the account id as a suffix.
  let username = claims.username;
  if (await getUserByUsername(username)) {
    username = `${claims.username}-${claims.sub.slice(0, 4)}`;
  }

  // The password column is NOT NULL but unused for imagination users: store a
  // random secret nobody knows, so password login cannot succeed.
  const created = await createUser({
    FullName: claims.name || claims.username,
    Username: username,
    Password: crypto.randomBytes(32).toString('hex'),
    accountId: claims.sub,
  } as Partial<IUser>);
  return created;
}
