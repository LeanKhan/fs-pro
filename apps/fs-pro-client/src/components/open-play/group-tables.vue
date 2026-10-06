<template>
  <v-row dense>
    <v-col v-for="g in table.groups" :key="g.group ?? 'all'" cols="12" :md="table.groups.length > 1 ? 6 : 12">
      <v-card variant="tonal" class="pa-2">
        <rankings-table
          :title="g.group ? `Group ${g.group}` : ''"
          :rows="g.rows"
          :metric="table.metric"
          :min-games-to-rank="table.minGamesToRank"
          :highlight-club-id="highlightClubId"
          :advance-top="advanceTop"
          :up-zone="upZone"
          :down-zone="downZone"
          :club-link="clubLink"
          :compact="compact"
        />
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import type { StageTable } from '@repo/api-contract';
import RankingsTable from './rankings-table.vue';

/** One table per group (a league stage is one group with no name). */
withDefaults(
  defineProps<{
    table: StageTable;
    highlightClubId?: string | null;
    advanceTop?: number | null;
    upZone?: number;
    downZone?: number;
    clubLink?: ((clubId: string) => string) | null;
    compact?: boolean;
  }>(),
  { highlightClubId: null, advanceTop: null, upZone: 0, downZone: 0, clubLink: null, compact: false }
);
</script>
