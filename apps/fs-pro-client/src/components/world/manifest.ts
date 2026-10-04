import { ref } from 'vue';

/** Which world map art exists (public/world/manifest.json, built by
 * scripts/world/build-manifest.mjs), so missing art can fall back. */

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

  return { has, ready, files };
}
