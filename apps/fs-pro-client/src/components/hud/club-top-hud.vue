<template>
  <div class="club-top-hud d-flex justify-space-between align-start px-4 py-2">
    <!-- Left: Club identity -->
    <v-card class="club-identity-card d-flex align-center gap-3 pa-2 pr-4 border" rounded="lg" :style="glassStyle">
      <v-avatar size="46" color="indigo-darken-3" class="elevation-2">
        <v-icon size="26">mdi-shield-crown</v-icon>
      </v-avatar>
      <div class="d-flex flex-column">
        <div class="d-flex align-center gap-2">
          <span class="text-subtitle-2 font-weight-bold text-white text-uppercase">{{ clubName }}</span>
          <v-chip size="x-small" color="indigo" variant="flat" class="font-weight-bold">Lv {{ clubLevel }}</v-chip>
        </div>
        <div class="text-caption text-medium-emphasis d-flex align-center gap-1">
          <v-icon size="12" color="amber-lighten-2">mdi-map-marker</v-icon>
          {{ location }}
        </div>
      </div>
    </v-card>

    <!-- Right: Treasury & settings -->
    <div class="d-flex align-center gap-2">
      <v-chip size="large" variant="flat" color="indigo-darken-4" class="font-weight-bold border" :style="chipBorder">
        <v-icon start size="18" color="success">mdi-cash</v-icon>
        <span class="text-success">{{ formatCurrency(budget) }}</span>
      </v-chip>
      <v-btn icon="mdi-cog" size="small" variant="tonal" color="indigo-lighten-2" @click="$emit('open-settings')"></v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { currency } from '@/helpers/misc';

withDefaults(
  defineProps<{
    clubName?: string;
    clubLevel?: number;
    location?: string;
    budget?: number;
  }>(),
  { clubName: 'Segun FC', clubLevel: 0, location: 'Abuja, Nigeria', budget: 10000 }
);

defineEmits<{ (e: 'open-settings'): void }>();

const formatCurrency = (val: number) => currency(val);
const glassStyle = {
  background: 'linear-gradient(135deg, rgba(30, 34, 53, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)',
  borderColor: 'rgba(99, 102, 241, 0.3)',
};
const chipBorder = { borderColor: 'rgba(99, 102, 241, 0.3)' };
</script>

<style scoped>
.club-top-hud {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  pointer-events: none;
}
.club-identity-card,
.club-top-hud > .d-flex {
  pointer-events: auto;
}
@media (max-width: 720px) {
  .club-identity-card :deep(.v-avatar) {
    width: 38px !important;
    height: 38px !important;
  }
}
</style>
