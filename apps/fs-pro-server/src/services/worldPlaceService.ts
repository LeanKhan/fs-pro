import { worldClient, type WorldEntityCard } from './worldClient';
import {
  getAllPlaces,
  createPlace,
  updatePlace,
} from '../controllers/places/places.service';
import type { IPlace } from '../controllers/places/places.model';

/**
 * Keeps FS-Pro's country rows in step with `country` places in the
 * Imaginations world. The world owns a country's identity, name and code;
 * FS-Pro keeps a local row (stable FK for cups, promotion/relegation and
 * player nationality) that is only ever refreshed explicitly - the season sim
 * never calls the world.
 */

export interface SyncSummary {
  offline: boolean;
  checked: number;
  updated: string[];
  stale: string[];
  errors: string[];
}

async function localCountries(): Promise<IPlace[]> {
  return getAllPlaces({ Type: 'country' });
}

/** Adds a world `country` place as a local country row (or refreshes it if already imported). */
export async function importCountryFromWorld(entityId: string): Promise<IPlace> {
  const result = await worldClient.getCard(entityId);
  if (result.status === 'offline') {
    throw new Error('The world server could not be reached. Try again later.');
  }
  if (result.status === 'missing') {
    throw new Error('That place does not exist in the world.');
  }
  const card = result.card;
  if (card.kind !== 'country') {
    throw new Error(`"${card.name}" is a ${card.kind}, not a country.`);
  }
  if (!card.code) {
    throw new Error(
      `"${card.name}" has no code in the world. Set its code in Imaginations first.`
    );
  }

  const countries = await localCountries();
  const existing = countries.find((c) => c.entity_id === card.id);
  const codeOwner = countries.find(
    (c) => c.Code === card.code && c.entity_id !== card.id
  );
  if (codeOwner) {
    throw new Error(
      `Code ${card.code} is already used by ${codeOwner.Name} in FS-Pro.`
    );
  }

  const snapshot = {
    Name: card.name,
    Code: card.code,
    entity_id: card.id,
    WorldRevision: card.revision,
    WorldSyncedAt: new Date(),
    WorldStale: false,
  };
  if (existing) {
    return (await updatePlace(existing._id, snapshot)) as IPlace;
  }
  return (await createPlace({
    ...snapshot,
    Fullname: card.name,
    Region: '',
    Type: 'country',
  })) as IPlace;
}

/** Refreshes every world-linked country row whose world revision moved on. */
export async function syncPlacesFromWorld(): Promise<SyncSummary> {
  const summary: SyncSummary = {
    offline: false,
    checked: 0,
    updated: [],
    stale: [],
    errors: [],
  };
  const linked = (await localCountries()).filter((c) => c.entity_id);
  summary.checked = linked.length;
  if (!linked.length) return summary;

  const { cards, offline } = await worldClient.getCards(
    linked.map((c) => c.entity_id as string)
  );
  if (offline) {
    summary.offline = true;
    return summary;
  }

  for (const place of linked) {
    const card = cards.get(place.entity_id as string);
    try {
      if (!card) {
        // Deleted in the world: keep the last known values and flag it.
        if (!place.WorldStale) {
          await updatePlace(place._id, { WorldStale: true });
        }
        summary.stale.push(place.Name);
        continue;
      }
      if (
        !place.WorldStale &&
        place.WorldRevision != null &&
        card.revision <= place.WorldRevision
      ) {
        continue;
      }
      const changes: Record<string, unknown> = {
        Name: card.name,
        WorldRevision: card.revision,
        WorldSyncedAt: new Date(),
        WorldStale: false,
      };
      // Fullname mirrors the name unless it was customised locally.
      if (place.Fullname === place.Name) changes.Fullname = card.name;
      if (card.code) changes.Code = card.code;
      await updatePlace(place._id, changes);
      summary.updated.push(card.name);
    } catch (err) {
      summary.errors.push(
        `${place.Name}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  return summary;
}

export interface ResolvedAnchor {
  card: WorldEntityCard;
  /** Local country row for the nearest `country` ancestor, when it has been imported. */
  countryId: string | null;
  /** The world country that has no local row yet - the form can offer to import it. */
  missingCountry: { entity_id: string; name: string } | null;
  city: string | null;
}

/** Resolves a club's anchor place to its derived country and city. Returns null when the world is unreachable or the place is unknown. */
export async function resolveAnchor(
  entityId: string
): Promise<ResolvedAnchor | null> {
  const result = await worldClient.getCard(entityId);
  if (result.status !== 'ok') return null;
  const card = result.card;

  // Ancestors run root-first; the anchor itself may already be the country/city.
  const chain = [
    ...card.ancestors,
    { id: card.id, name: card.name, kind: card.kind, code: card.code },
  ];
  const nearest = (kind: string) =>
    [...chain].reverse().find((a) => a.kind === kind) ?? null;

  const country = nearest('country');
  const city = nearest('city');
  let countryId: string | null = null;
  let missingCountry: ResolvedAnchor['missingCountry'] = null;
  if (country) {
    const local = (await localCountries()).find(
      (c) => c.entity_id === country.id
    );
    if (local) countryId = local._id;
    else missingCountry = { entity_id: country.id, name: country.name };
  }
  return { card, countryId, missingCountry, city: city?.name ?? null };
}

/**
 * Fills in what the world can derive for a club being saved: its country FK
 * and the cached city display name. Best effort - if the world is down or the
 * country was not imported, the club is saved unchanged.
 */
export async function applyClubAnchors<
  T extends { Address?: any; AddressCountryId?: any },
>(data: T): Promise<T> {
  const anchor = data.Address?.entity_id;
  if (!anchor) return data;
  try {
    const resolved = await resolveAnchor(anchor);
    if (!resolved) return data;
    if (resolved.countryId) data.AddressCountryId = resolved.countryId;
    if (resolved.city) data.Address = { ...data.Address, City: resolved.city };
  } catch (err) {
    console.warn('applyClubAnchors failed:', err);
  }
  return data;
}
