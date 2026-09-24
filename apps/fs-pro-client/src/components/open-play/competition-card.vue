<template>
  <v-card class="competition-card" :class="{ 'cc-ineligible': eligibility && !eligibility.eligible }" variant="elevated">
    <v-card-item>
      <template #prepend>
        <v-avatar :color="formatColor" size="40">
          <v-icon>{{ formatIcon }}</v-icon>
        </v-avatar>
      </template>
      <v-card-title class="d-flex align-center ga-2">
        <span class="text-truncate">{{ edition.title }}</span>
        <v-rating
          v-if="prestige"
          :model-value="prestige"
          readonly
          density="compact"
          size="x-small"
          length="5"
          color="amber"
          active-color="amber"
          empty-icon="mdi-star-outline"
        />
      </v-card-title>
      <v-card-subtitle class="d-flex align-center ga-2">
        <v-chip size="x-small" :color="STATUS_COLORS[edition.status]" variant="flat">
          {{ STATUS_LABELS[edition.status] ?? edition.status }}
        </v-chip>
        <span>{{ dates }}</span>
      </v-card-subtitle>
    </v-card-item>
    <v-card-text class="pt-0">
      <div class="text-body-2 mb-2">{{ formatSummary(def) }}</div>
      <stage-timeline :definition="def" :current-stage="edition.currentStage" :status="edition.status" />
      <div v-if="rewards" class="text-caption text-medium-emphasis mt-2">
        <v-icon size="14">mdi-cash</v-icon> Winner {{ money(rewards) }}
      </div>
      <div v-if="eligibility && !eligibility.eligible" class="mt-2">
        <div v-for="r in eligibility.reasons" :key="r" class="text-caption text-red-lighten-2">
          <v-icon size="14">mdi-lock</v-icon> {{ r }}
        </div>
      </div>
      <div v-if="entryStatus" class="mt-2">
        <v-chip size="x-small" :color="STATUS_COLORS[entryStatus]">You: {{ entryStatus }}</v-chip>
      </div>
    </v-card-text>
    <v-card-actions>
      <v-btn variant="text" :to="`/u/competitions/${edition.id}`">View</v-btn>
      <v-spacer />
      <slot name="actions" />
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Eligibility, EditionListItem } from '@repo/api-contract';
import StageTimeline from './stage-timeline.vue';
import { STATUS_COLORS, STATUS_LABELS, formatSummary, money } from '@/helpers/open-play';

const props = withDefaults(
  defineProps<{ edition: EditionListItem; eligibility?: Eligibility | null; entryStatus?: string | null }>(),
  { eligibility: null, entryStatus: null }
);

type Def = {
  Prestige?: number;
  Stages?: { type: 'league' | 'groups' | 'knockout' }[];
  Rewards?: { prizeMoney?: { position: number; amount: number }[] };
};
const def = computed(() => props.edition.definition as Def | null);
const prestige = computed(() => def.value?.Prestige ?? 0);
const rewards = computed(() => def.value?.Rewards?.prizeMoney?.find((p) => p.position === 1)?.amount ?? 0);

/** Format decides the badge: league, cup (knockout), groups, or event. */
const format = computed(() => {
  const types = (def.value?.Stages ?? []).map((s) => s.type);
  if (types.length === 1 && types[0] === 'league') return 'league';
  if (types.every((t) => t === 'knockout')) return 'cup';
  if (types.includes('groups')) return 'groups';
  return 'event';
});
const formatIcon = computed(
  () => ({ league: 'mdi-format-list-numbered', cup: 'mdi-trophy', groups: 'mdi-view-grid', event: 'mdi-flag-checkered' })[format.value]
);
const formatColor = computed(() => ({ league: 'indigo', cup: 'amber-darken-2', groups: 'teal', event: 'purple' })[format.value]);

const dates = computed(() => {
  const e = props.edition;
  if (e.status === 'registration' && e.registrationClosesDay != null) return `Entries close day ${e.registrationClosesDay}`;
  if (e.startDay != null && e.endDay != null) return `Days ${e.startDay}–${e.endDay}`;
  if (e.startDay != null) return `Starts day ${e.startDay}`;
  return '';
});
</script>

<style scoped>
.cc-ineligible {
  opacity: 0.75;
}
</style>
