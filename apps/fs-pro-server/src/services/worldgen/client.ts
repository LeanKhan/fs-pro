/**
 * Thin HTTP client for worldgen-service (a separate Go service - "this
 * repo's Go code" per its own OpenAPI spec - exposing deterministic
 * names/faces generation over HTTP). This is the first of what the user
 * described as a family of small external services fs-pro will call this
 * same way (a names-generation integration is planned as a follow-up) -
 * keep new calls to worldgen-service's other endpoints in this file rather
 * than scattering `fetch` calls through the codebase.
 *
 * Base URL is configurable via WORLDGEN_SERVICE_URL (defaults to the
 * service's own local-dev default, http://localhost:3004) - never
 * hardcode the URL at a call site.
 */

const DEFAULT_BASE_URL = 'http://localhost:3004';

function getBaseUrl(): string {
  return process.env.WORLDGEN_SERVICE_URL || DEFAULT_BASE_URL;
}

export type FaceVersion = 'v1' | 'v2' | 'v3';

/**
 * Fetches a deterministic face SVG for the given identity - same identity
 * + version always returns byte-identical SVG (worldgen-service is a pure
 * function of its inputs), so nothing about this needs to be persisted on
 * our side - just call it fresh each time (the response is aggressively
 * cacheable, see getFaceSvg's caller for how that Cache-Control header
 * gets passed through).
 */
export async function getFaceSvg(
  identity: string,
  version: FaceVersion = 'v3'
): Promise<{ svg: string; cacheControl: string | null }> {
  const url = `${getBaseUrl()}/faces/generate?identity=${encodeURIComponent(identity)}&version=${version}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `worldgen-service /faces/generate failed (${response.status}) for identity "${identity}"`
    );
  }

  const svg = await response.text();
  return { svg, cacheControl: response.headers.get('cache-control') };
}
