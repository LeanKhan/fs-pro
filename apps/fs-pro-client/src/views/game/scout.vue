<template>
  <div class="cozy scx">
    <header class="scx-bar">
      <button class="btn small" @click="back">‹ Back</button>
      <strong>Scout the base</strong>
    </header>
    <main class="scx-body">
      <scout-report
        :club-id="clubId"
        :opponent-id="opponentId"
        @toast="onToast"
      />
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
import ScoutReport from '@/components/cozy/scout-report.vue';

/**
 * The full-screen host for the Scout screen (docs/coc-mapping/08 §6.1),
 * deep-linkable as `/game/:clubId/scout/:oppId`. It is the "crack the base"
 * surface reached from the matchmaking opponent list; the report itself lives
 * in `components/cozy/scout-report.vue`.
 */
const route = useRoute();
const router = useRouter();

const clubId = computed(() => route.params.clubId as string);
const opponentId = computed(() => route.params.oppId as string);

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
.scx {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: linear-gradient(#bfe4ff, #fdf4df);
}
.scx-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 3px solid #e2cc9c;
  background: #fff8e6;
}
.scx-bar strong {
  font-size: 18px;
}
.scx-body {
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
