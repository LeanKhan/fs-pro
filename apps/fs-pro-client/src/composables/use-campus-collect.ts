import { computed, ref, type Ref } from 'vue';
import type { CampusState, CollectorState } from '@repo/api-contract';
import { client } from '@/services/api';
import {
  buildersQueue,
  canCollectAll,
  collectableCollectors,
  optimisticallyCollected,
  type BuildJob,
} from '@/helpers/campus-queue';

/**
 * The campus collect/builders slice (docs/coc-mapping/08 §4.1, P1): reads the
 * typed `campus.get` route and runs the `campus.collect` mutation, exposing the
 * builders queue and the "Collect All" gate derived by the pure helpers in
 * `helpers/campus-queue`. The server owns the outcome; this only mirrors it.
 */
export function useCampusCollect(clubId: Ref<string | undefined>) {
  const campus = ref<CampusState | null>(null);
  const loading = ref(false);
  const collecting = ref(false);
  const error = ref('');

  const queue = computed<BuildJob[]>(() =>
    campus.value ? buildersQueue(campus.value) : []
  );
  const collectable = computed<CollectorState[]>(() =>
    campus.value ? collectableCollectors(campus.value) : []
  );
  const canCollect = computed(() =>
    campus.value ? canCollectAll(campus.value) : false
  );

  async function load() {
    if (!clubId.value) return;
    loading.value = true;
    error.value = '';
    try {
      const res = await client.campus.get.query({
        params: { clubId: clubId.value },
      });
      if (res.status === 200) campus.value = res.body.payload;
      else error.value = res.body.message;
    } catch (err) {
      error.value = 'Could not load the campus.';
      console.error('Failed to load the campus:', err);
    } finally {
      loading.value = false;
    }
  }

  /** Bank every collector. Resolves to the fresh campus, or null if it failed. */
  async function collectAll(): Promise<CampusState | null> {
    if (!clubId.value || collecting.value || !canCollect.value) return null;
    const before = campus.value;
    collecting.value = true;
    error.value = '';
    // Optimistic: empty the collectors and restart their fill timers locally so
    // the tap feels instant. The server response replaces this in full.
    if (before) campus.value = optimisticallyCollected(before);
    try {
      const res = await client.campus.collect.mutation({
        params: { clubId: clubId.value },
        body: {},
      });
      if (res.status === 200) {
        campus.value = res.body.payload;
        return res.body.payload;
      }
      // Refused (e.g. 409 nothing accrued): drop the optimistic read.
      campus.value = before;
      error.value = res.body.message;
      return null;
    } catch (err) {
      campus.value = before;
      error.value = 'Could not collect.';
      console.error('Failed to collect the campus:', err);
      return null;
    } finally {
      collecting.value = false;
    }
  }

  return {
    campus,
    loading,
    collecting,
    error,
    queue,
    collectable,
    canCollect,
    load,
    collectAll,
  };
}
