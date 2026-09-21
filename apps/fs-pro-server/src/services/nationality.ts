import { getAllPlaces } from '../controllers/places/places.service';

/** Ids the generator hardcoded before countries could come from the world. Used only when no local country matches. */
const LEGACY_COUNTRY_IDS: Record<string, string> = {
  kev: 'f526f31c-53e6-4eac-8b07-9591deea5a6e',
  bellean: 'b4f41821-c586-4b67-8dfc-521c51cd00e0',
};

/**
 * Finds the local country row for a name-generation culture (e.g. 'kev'),
 * matching its Code, Name or the end of its Fullname. Falls back to the legacy
 * ids so an existing database keeps working before any country is imported.
 */
export async function nationalityIdForCulture(culture: string): Promise<string> {
  const key = culture.trim().toLowerCase();
  const countries = await getAllPlaces({ Type: 'country' });
  const match =
    countries.find(
      (c) => c.Code.toLowerCase() === key || c.Name.toLowerCase() === key
    ) ??
    countries.find((c) => c.Fullname.toLowerCase().endsWith(` ${key}`));
  return match?._id ?? LEGACY_COUNTRY_IDS[key] ?? LEGACY_COUNTRY_IDS.bellean;
}
