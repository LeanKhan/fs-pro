<template>
  <img
    v-if="playerId"
    :src="faceUrl"
    :width="size"
    :height="size"
    alt="Player avatar"
    class="player-avatar"
    :style="{ width: `${size}px`, height: `${size}px` }"
  />
  <div
    v-else
    class="player-avatar player-avatar--placeholder"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <v-icon :size="size * 0.44" color="grey">mdi-account</v-icon>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { apiUrl } from '@/store';

interface Props {
  /** A saved player's real _id - the seed worldgen-service generates a
   * deterministic face SVG from (see player-face.router.ts server-side).
   * No id yet (e.g. a not-yet-created player) renders a placeholder
   * instead, since there's nothing stable to seed a face with until the
   * player actually exists. */
  playerId?: string | null;
  size?: number;
}

const props = withDefaults(defineProps<Props>(), {
  size: 144,
});

const faceUrl = computed(() => `${apiUrl}/api/players/${props.playerId}/face`);
</script>

<style scoped>
.player-avatar {
  border-radius: 4px;
  object-fit: cover;
}

.player-avatar--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(128, 128, 128, 0.15);
  border-radius: 4px;
}
</style>
