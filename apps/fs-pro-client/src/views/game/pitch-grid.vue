<template>
  <div class="cozy pgx">
    <header class="pgx-bar">
      <button class="btn small" @click="back">‹ Back</button>
      <strong>{{ title }}</strong>
    </header>
    <main class="pgx-body">
      <pitch-grid-editor :club-id="clubId" :mode="mode" @toast="onToast" />
    </main>
    <div class="toasts">
      <div
        v-if="toastText"
        class="toast"
        :class="toastLevel === 'error' ? 'bad' : 'good'"
      >
        {{ toastText }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import '@/components/cozy/cozy.scss';
import PitchGridEditor from '@/components/cozy/grid/pitch-grid-editor.vue';

/**
 * The full-screen host for the Pitch Grid editor, deep-linkable as
 * `/game/:clubId/grid?mode=edit|scout|review` (08 §3). The editor itself is also
 * mounted as a campus-hub tab, so this route is the "flagship screen" surface
 * and the hub is the in-campus shortcut.
 */
const route = useRoute();
const router = useRouter();

const clubId = computed(() => route.params.clubId as string);
const mode = computed<'edit' | 'scout' | 'review'>(() => {
  const m = String(route.query.mode ?? 'edit');
  return m === 'scout' || m === 'review' ? m : 'edit';
});
const title = computed(() =>
  mode.value === 'scout'
    ? 'Scout the shape'
    : mode.value === 'review'
      ? 'Shape review'
      : 'Pitch grid'
);

const toastText = ref('');
const toastLevel = ref<'success' | 'error'>('success');
let toastTimer: ReturnType<typeof setTimeout> | null = null;
function onToast(text: string, level: 'success' | 'error' = 'success') {
  toastText.value = text;
  toastLevel.value = level;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastText.value = ''), 3000);
}
onUnmounted(() => {
  if (toastTimer) clearTimeout(toastTimer);
});

function back() {
  router.push(`/game/${clubId.value}`);
}
</script>

<style scoped>
.pgx {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: linear-gradient(#bfe4ff, var(--cream));
}
.pgx-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 3px solid var(--panel-line);
  background: var(--panel-top);
}
.pgx-bar strong {
  font-size: 18px;
}
.pgx-body {
  flex: 1;
  overflow: auto;
  padding: 14px;
}
.toasts {
  position: fixed;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  pointer-events: none;
}
</style>
