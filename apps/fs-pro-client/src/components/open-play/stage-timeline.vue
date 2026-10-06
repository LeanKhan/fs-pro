<template>
  <div class="stage-timeline d-flex align-center flex-wrap ga-1">
    <template v-for="(s, i) in stages" :key="i">
      <v-chip
        size="small"
        :variant="i === current ? 'flat' : 'tonal'"
        :color="i < current || finished ? 'indigo' : i === current ? 'amber' : 'grey'"
        :prepend-icon="icon(s.type)"
      >
        {{ label(s, i) }}
      </v-chip>
      <v-icon v-if="i < stages.length - 1" size="16" class="text-medium-emphasis">mdi-chevron-right</v-icon>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { stageName, type StageLike } from '@/helpers/open-play';

/** League → groups → knockout, with the current stage lit. */
const props = withDefaults(defineProps<{ definition: unknown; currentStage?: number; status?: string }>(), {
  currentStage: 0,
  status: 'draft',
});

const stages = computed<StageLike[]>(() => ((props.definition as { Stages?: StageLike[] } | null)?.Stages ?? []));
const finished = computed(() => props.status === 'finished');
const current = computed(() => (props.status === 'running' ? props.currentStage : finished.value ? stages.value.length : -1));
const icon = (t: string) => (t === 'league' ? 'mdi-format-list-numbered' : t === 'groups' ? 'mdi-view-grid' : 'mdi-tournament');
function label(s: StageLike, i: number) {
  const base = stageName(s, i);
  if (s.type === 'knockout') return `${base}${s.legs === 2 ? ' (2 legs)' : ''}`;
  return `${base} · ${s.days}d`;
}
</script>
