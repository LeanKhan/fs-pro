import { getSeasons } from '../../controllers/seasons/season.service';

/** Seasons (editions) carrying a legacy text Year label. Kept for the
 * legacy history screens until the old columns are dropped; open-play
 * editions are read through /editions. */
export async function getCurrentSeasonsForYear(year: string) {
  return getSeasons({ Year: year });
}
