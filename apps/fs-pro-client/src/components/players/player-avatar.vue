<template>
  <img
    v-if="playerId"
    :src="faceUrl"
    width="144"
    height="144"
    alt="Player avatar"
    class="player-avatar"
  />
  <div v-else class="player-avatar player-avatar--placeholder">
    <v-icon size="64" color="grey">mdi-account</v-icon>
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
}

const props = defineProps<Props>();

const faceUrl = computed(() => `${apiUrl}/api/players/${props.playerId}/face`);
</script>

<style scoped>
.player-avatar {
  width: 144px;
  height: 144px;
}

.player-avatar--placeholder {
  width: 144px;
  height: 144px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(128, 128, 128, 0.15);
  border-radius: 4px;
}
</style>
