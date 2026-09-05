<template>
  <img
    v-if="managerId"
    :src="faceUrl"
    :width="size"
    :height="size"
    alt="Manager avatar"
    class="manager-avatar"
  />
  <div
    v-else
    class="manager-avatar manager-avatar--placeholder"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <v-icon :size="size * 0.45" color="grey">mdi-account-tie</v-icon>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { apiUrl } from '@/store';

interface Props {
  /** A saved manager's real _id - worldgen-service generates a
   * deterministic face SVG from it, same pattern as player-avatar.vue. */
  managerId?: string | null;
  size?: number;
}

const props = withDefaults(defineProps<Props>(), {
  size: 40,
});

const faceUrl = computed(() => `${apiUrl}/api/managers/${props.managerId}/face`);
</script>

<style scoped>
.manager-avatar {
  border-radius: 50%;
  object-fit: cover;
}

.manager-avatar--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(128, 128, 128, 0.15);
  border-radius: 50%;
}
</style>
