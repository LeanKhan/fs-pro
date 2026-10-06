<template>
  <div class="edition-standings">
    <v-btn-toggle v-if="stages.length > 1" v-model="stage" density="compact" variant="outlined" divided class="mb-3" mandatory>
      <v-btn v-for="(s, i) in stages" :key="i" :value="i" size="small" :disabled="i > maxStage">
        {{ stageName(s, i) }}
      </v-btn>
    </v-btn-toggle>
    <v-progress-linear v-if="loading" indeterminate color="teal" class="mb-2" />
    <v-alert v-if="error" type="warning" density="compact" variant="tonal">{{ error }}</v-alert>
    <template v-else-if="isKnockout">
      <bracket-view :bracket="bracket" :highlight-club-id="highlightClubId" />
    </template>
    <template v-else-if="table">
      <group-tables
        :table="table"
        :highlight-club-id="highlightClubId"
        :advance-top="advanceTop"
        :up-zone="compact ? 0 : upZone"
        :down-zone="compact ? 0 : downZone"
        :compact="compact"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Bracket, StageTable } from '@repo/api-contract';
import BracketView from './bracket-view.vue';
import GroupTables from './group-tables.vue';
import { client } from '@/services/api';
import { unwrap, useOpenPlayStore } from '@/store/open-play';
import { stageName, type StageLike } from '@/helpers/open-play';

/** The table (league / groups) or bracket (knockout) of an edition's stage. */
const props = withDefaults(
  defineProps<{
    editionId: string;
    definition: unknown;
    currentStage?: number;
    status?: string;
    highlightClubId?: string | null;
    compact?: boolean;
  }>(),
  { currentStage: 0, status: 'running', highlightClubId: null, compact: false }
);

type Outcome = { type: string; positions: [number, number]; change?: number };
const def = computed(() => (props.definition ?? {}) as { Stages?: StageLike[]; Outcomes?: Outcome[] });
const stages = computed(() => def.value.Stages ?? []);
const maxStage = computed(() => (props.status === 'finished' ? stages.value.length - 1 : props.currentStage));
const stage = ref(props.currentStage);
const isKnockout = computed(() => stages.value[stage.value]?.type === 'knockout');
const isLast = computed(() => stage.value === stages.value.length - 1);
const advanceTop = computed(() => {
  const s = stages.value[stage.value];
  return !isLast.value && s?.type !== 'knockout' && s?.advance && !s.advance.perGroup ? s.advance.top : null;
});
const upZone = computed(() => (isLast.value ? Math.max(0, ...(def.value.Outcomes ?? []).filter((o) => o.type === 'level' && o.change === 1).map((o) => o.positions[1])) : 0));
const downZone = computed(() => {
  if (!isLast.value) return 0;
  const down = (def.value.Outcomes ?? []).filter((o) => o.type === 'level' && o.change === -1);
  return down.length ? Math.max(...down.map((o) => o.positions[1] - o.positions[0] + 1)) : 0;
});

const table = ref<StageTable | null>(null);
const bracket = ref<Bracket | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const q = { params: { id: props.editionId }, query: { stage: stage.value } };
    if (isKnockout.value) bracket.value = unwrap<Bracket>(await client.editions.bracket.query(q));
    else table.value = unwrap<StageTable>(await client.editions.rankings.query(q));
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.editionId, props.currentStage] as const,
  () => {
    stage.value = Math.min(props.currentStage, Math.max(0, stages.value.length - 1));
    void load();
  },
  { immediate: true }
);
watch(stage, () => void load());
// Live: refetch when a result lands in this edition.
const live = useOpenPlayStore();
watch(
  () => [live.rankingsVersion, live.editionsVersion],
  () => {
    if (live.touchedEditions.has(props.editionId)) void load();
  }
);
defineExpose({ reload: load });
</script>
