import { apiUrl } from '@/services/api';

/**
 * A club's crest image. The API is the single source of truth: it draws a
 * founded club's CrestDesign as SVG, and for the original clubs it redirects
 * to their hand-drawn logo. The client keeps no code→file table (phase-1 B5A).
 */
export function crestUrl(code: string | null | undefined): string {
  return code ? `${apiUrl}/api/crests/${encodeURIComponent(code)}.svg` : '';
}

/** A club's home-shirt image: drawn from the crest for founded clubs, the
 * original image file for the rest (the API redirects). */
export function kitUrl(code: string | null | undefined): string {
  return code ? `${apiUrl}/api/kits/${encodeURIComponent(code)}.svg` : '';
}
