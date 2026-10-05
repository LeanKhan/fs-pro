<template>
  <v-row dense>
    <v-col v-for="g in shown" :key="g.group ?? 'all'" cols="12" :md="shown.length > 1 ? 6 : 12">
      <v-card variant="tonal" class="pa-2">
        <rankings-table
          :title="g.name ?? (g.group ? `Group ${g.group}` : '')"
          :rows="g.rows"
          :metric="g.metric ?? table.metric"
          :min-games-to-rank="g.minGamesToRank ?? table.minGamesToRank"
          :highlight-club-id="highlightClubId"
          :advance-top="advanceTop"
          :up-zone="pyramid ? (g.division && g.division > 1 ? pyramid.promote : 0) : upZone"
          :down-zone="pyramid ? (g.division && g.division < bottomDivision ? pyramid.relegate : 0) : downZone"
          :club-link="clubLink"
          :compact="compact"
        />
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { StageTable } from '@repo/api-contract';
import RankingsTable from './rankings-table.vue';

/** One table per group (a league stage is one group with no name). A
 * pyramid league's groups are its pools (docs/WORLD-PYRAMID-SPEC.md): each
 * has a name, its own table order and promotion/relegation zones; compact
 * views show only the top division and the highlighted club's pool. */
const props = withDefaults(
  defineProps<{
    table: StageTable;
    highlightClubId?: string | null;
    advanceTop?: number | null;
    upZone?: number;
    downZone?: number;
    clubLink?: ((clubId: string) => string) | null;
    compact?: boolean;
    pyramid?: { promote: number; relegate: number } | null;
  }>(),
  { highlightClubId: null, advanceTop: null, upZone: 0, downZone: 0, clubLink: null, compact: false, pyramid: null }
);

const bottomDivision = computed(() => Math.max(1, ...props.table.groups.map((g) => g.division ?? 1)));
const shown = computed(() => {
  if (!props.pyramid || !props.compact) return props.table.groups;
  const mine = props.table.groups.find((g) => g.rows.some((r) => r.clubId === props.highlightClubId));
  const top = props.table.groups.find((g) => g.division === 1);
  return [...new Set([mine, top].filter((g): g is StageTable['groups'][number] => !!g))];
});
</script>
