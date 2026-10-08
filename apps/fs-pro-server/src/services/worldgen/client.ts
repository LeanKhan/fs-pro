/**
 * Thin HTTP client for worldgen (services/worldgen) - the in-repo Go service
 * that owns fs-pro's non-football generation: character names and faces
 * today, news and similar content generators later. This replaces the old
 * client that called imagination's external worldgen-service, so fs-pro no
 * longer has a cross-repo dependency for generated content.
 *
 * Keep every call to the service in this file rather than scattering
 * `fetch` calls through the codebase. Base URL is configurable via
 * WORLDGEN_SERVICE_URL (defaults to the service's local-dev default,
 * http://localhost:3004) - never hardcode the URL at a call site.
 */

const DEFAULT_BASE_URL = 'http://localhost:3004';

function getBaseUrl(): string {
  return process.env.WORLDGEN_SERVICE_URL || DEFAULT_BASE_URL;
}

export type FaceVersion = 'v1' | 'v2' | 'v3';

/** Which piece(s) of a generated name to return (worldgen `returnParts`). */
export type NameReturnParts = 'f_l' | 'f' | 'l';

/**
 * Fetches a deterministic face SVG for the given identity - same identity
 * + version always returns byte-identical SVG (worldgen is a pure function
 * of its inputs), so nothing about this needs to be persisted on our side:
 * just call it fresh each time (the response is aggressively cacheable, see
 * getFaceSvg's caller for how that Cache-Control header gets passed through).
 */
export async function getFaceSvg(
  identity: string,
  version: FaceVersion = 'v3'
): Promise<{ svg: string; cacheControl: string | null }> {
  const url = `${getBaseUrl()}/faces/generate?identity=${encodeURIComponent(identity)}&version=${version}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `worldgen /faces/generate failed (${response.status}) for identity "${identity}"`
    );
  }

  const svg = await response.text();
  return { svg, cacheControl: response.headers.get('cache-control') };
}

/** The wire shape of a names response; `cultures` is the mix histogram. */
export interface GeneratedNames {
  names: string[];
  cultures?: Record<string, number>;
}

/** Never let a slow worldgen stall a founding transaction. */
const NAME_TIMEOUT_MS = Number(process.env.WORLDGEN_TIMEOUT_MS) || 2_500;

async function postNamesFull(
  path: string,
  body: Record<string, unknown>
): Promise<GeneratedNames> {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(NAME_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`worldgen ${path} failed (${response.status})`);
  }

  const payload = (await response.json()) as GeneratedNames;
  return { names: payload.names ?? [], cultures: payload.cultures };
}

async function postNames(path: string, body: Record<string, unknown>): Promise<string[]> {
  return (await postNamesFull(path, body)).names;
}

/**
 * Generates `count` names for a culture. The default `f_l` returns
 * "firstname__lastname" (the double underscore is worldgen's own split
 * marker, the same one the name bank uses).
 */
export function generateNames(
  count: number,
  culture: string,
  returnParts: NameReturnParts = 'f_l'
): Promise<string[]> {
  return postNames('/names/generate', { count, culture, returnParts });
}

/**
 * Mix-aware generation for a country: returns `count` names of `kind` using
 * the country's demographic mix, plus the per-culture histogram actually drawn.
 * This is what the world seed and the foreign intake use, so a country's
 * players are named by its cultures (L12), not by a single syllable table.
 */
export function generateMixedNames(
  country: string,
  count: number,
  kind: 'first' | 'last' | 'full' | 'club' | 'region' | 'city' | 'district' | 'stadium' = 'full',
  seed?: number
): Promise<GeneratedNames> {
  return postNamesFull('/names/mixed', {
    country,
    count,
    kind,
    ...(seed != null ? { seed } : {}),
  });
}

/** Generates `count` first names that share the given last name. */
export function generateFamilyNames(
  count: number,
  culture: string,
  lastname: string
): Promise<string[]> {
  return postNames('/names/family', { count, culture, lastname });
}

/** True when worldgen answers its /health endpoint (for the services API). */
export async function worldgenHealthy(): Promise<boolean> {
  try {
    return (await fetch(`${getBaseUrl()}/health`)).ok;
  } catch {
    return false;
  }
}
