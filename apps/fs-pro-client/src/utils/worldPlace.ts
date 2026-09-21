/** The world (Imaginations) FS-Pro places clubs into. */
export const WORLD_SLUG: string =
  import.meta.env.VITE_IMAGINATION_WORLD_SLUG || 'asterra';

/** What Imaginations' place picker posts back. `entity_id` is the universal id. */
export interface PickedPlace {
  id: string;
  entity_id?: string;
  name: string;
  kind: string;
  slug: string;
  code?: string | null;
  ancestors?: { id: string; name: string; kind: string; code: string | null }[];
}
