import { ref } from 'vue';
import { bandForTier, type PlotKey } from './types';

/**
 * Which world art exists (public/world/manifest.json, built by
 * scripts/world/build-manifest.mjs), and the fallback rules:
 * a facility at Tier t uses <key>-b<band(t)>.png, else the highest lower band
 * that exists, else nothing (the scene draws an empty plot with its name).
 */

const files = ref<Set<string> | null>(null);
let loading: Promise<void> | null = null;

export function loadManifest() {
  if (!loading) {
    loading = fetch('/world/manifest.json')
      .then((r) => (r.ok ? r.json() : { files: [] }))
      .then((m: { files?: string[] }) => {
        files.value = new Set(m.files ?? []);
      })
      .catch(() => {
        files.value = new Set();
      });
  }
  return loading;
}

export function useWorldManifest() {
  void loadManifest();
  const has = (path: string) => files.value?.has(path) ?? false;
  const ready = () => files.value !== null;

  /** Plate image for a plot at a Tier, or null for the empty placeholder. */
  function plateFor(key: PlotKey, tier = 0): string | null {
    if (key === 'office' || key === 'dugout') {
      const path = `campus/plates/${key}.png`;
      return has(path) ? `/world/${path}` : null;
    }
    for (let band = bandForTier(tier); band >= 0; band--) {
      const path = `campus/plates/${key}-b${band}.png`;
      if (has(path)) return `/world/${path}`;
    }
    return null;
  }

  return { has, ready, plateFor, files };
}
