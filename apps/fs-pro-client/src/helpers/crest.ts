import { apiUrl } from '@/services/api';
import { iconFileByName } from '@/plugins/customIcons';

/** Where a club's crest image lives: the original clubs have hand-drawn
 * SVGs in public/club-icons; clubs founded in the game have their crest
 * drawn by the API from their CrestDesign (api-contract crest.ts). */
export function crestUrl(code: string | null | undefined): string {
  if (!code) return '';
  const file = iconFileByName[code];
  return file ? `/club-icons/${file}.svg` : `${apiUrl}/api/crests/${encodeURIComponent(code)}.svg`;
}

/** A club's home-shirt image: drawn from the crest for founded clubs, the
 * original image file for the rest (the API redirects). */
export function kitUrl(code: string | null | undefined): string {
  return code ? `${apiUrl}/api/kits/${encodeURIComponent(code)}.svg` : '';
}
