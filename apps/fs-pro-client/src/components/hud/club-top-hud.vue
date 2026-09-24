<template>
  <div class="club-top-hud d-flex justify-space-between align-start px-4 py-2">
    <!-- Left: crest, name, Level, Elo -->
    <v-card class="club-identity-card d-flex align-center gap-3 pa-2 pr-4 border" rounded="lg" :style="glassStyle">
      <club-crest :code="clubCode" :name="clubName" :size="46" />
      <div class="d-flex flex-column">
        <div class="d-flex align-center gap-2">
          <span class="text-subtitle-2 font-weight-bold text-white text-uppercase">{{ clubName }}</span>
          <level-badge :xp="xp" :thresholds="thresholds" :size="24" show-label />
        </div>
        <div class="text-caption text-medium-emphasis d-flex align-center gap-2">
          <span><v-icon size="12" color="amber-lighten-2">mdi-map-marker</v-icon> {{ location }}</span>
          <span><v-icon size="12" color="teal-lighten-2">mdi-chart-line</v-icon> Elo {{ Math.round(elo) }}</span>
        </div>
      </div>
    </v-card>

    <!-- Right: cash, entries, inbox, settings -->
    <div class="d-flex align-center gap-2">
      <v-chip size="large" variant="flat" color="indigo-darken-4" class="font-weight-bold border" :style="chipBorder">
        <v-icon start size="18" color="success">mdi-cash</v-icon>
        <span class="text-success">{{ formatCurrency(budget) }}</span>
      </v-chip>
      <v-chip
        v-if="maxEntries"
        size="large"
        variant="flat"
        color="indigo-darken-4"
        class="font-weight-bold border hud-entries"
        :style="chipBorder"
        title="Competitions entered"
        @click="$emit('open-competitions')"
      >
        <v-icon start size="18" color="amber">mdi-flag</v-icon>
        {{ entriesUsed }} / {{ maxEntries }}
      </v-chip>
      <v-btn icon size="small" variant="tonal" color="indigo-lighten-2" title="Challenges" @click="$emit('open-inbox')">
        <v-badge v-if="inbox" :content="inbox" color="red" floating>
          <v-icon>mdi-bell</v-icon>
        </v-badge>
        <v-icon v-else>mdi-bell-outline</v-icon>
      </v-btn>
      <v-btn icon="mdi-cog" size="small" variant="tonal" color="indigo-lighten-2" @click="$emit('open-settings')"></v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { currency } from '@/helpers/misc';
import ClubCrest from '@/components/open-play/club-crest.vue';
import LevelBadge from '@/components/open-play/level-badge.vue';

/** Top bar (docs/WORLD-VIEW-UI-PLAN.md, "HUD"): crest and name, Level badge,
 * Elo, cash, entries used, inbox. */
withDefaults(
  defineProps<{
    clubName?: string;
    clubCode?: string | null;
    xp?: number;
    thresholds?: number[] | null;
    elo?: number;
    location?: string;
    budget?: number;
    entriesUsed?: number;
    maxEntries?: number | null;
    inbox?: number;
  }>(),
  {
    clubName: '',
    clubCode: null,
    xp: 0,
    thresholds: null,
    elo: 1500,
    location: '',
    budget: 0,
    entriesUsed: 0,
    maxEntries: null,
    inbox: 0,
  }
);

defineEmits<{ (e: 'open-settings'): void; (e: 'open-inbox'): void; (e: 'open-competitions'): void }>();

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
.hud-entries {
  cursor: pointer;
}
@media (max-width: 720px) {
  .hud-entries {
    display: none;
  }
}
</style>
