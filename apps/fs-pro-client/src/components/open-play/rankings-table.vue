<template>
  <div class="rankings-table">
    <div v-if="title" class="text-subtitle-2 font-weight-bold mb-1">{{ title }}</div>
    <v-table density="compact" class="rt-table">
      <thead>
        <tr>
          <th class="text-left" style="width: 36px">#</th>
          <th class="text-left">Club</th>
          <th v-for="col in columns" :key="col.key" class="text-right" :class="{ 'rt-lead': col.lead }">
            {{ col.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-for="(row, i) in rows" :key="row.clubId">
          <tr v-if="i === firstUnranked" class="rt-divider">
            <td :colspan="columns.length + 2" class="text-caption text-medium-emphasis">
              Not ranked yet (fewer than {{ minGamesToRank }} games)
            </td>
          </tr>
          <tr v-if="advanceTop && i === advanceTop" class="rt-advance-line">
            <td :colspan="columns.length + 2"></td>
          </tr>
          <tr
            :class="{
              'rt-mine': row.clubId === highlightClubId,
              'rt-up': zoneOf(row.rank) === 'up',
              'rt-down': zoneOf(row.rank) === 'down',
            }"
          >
            <td>
              <span v-if="row.rank != null" class="font-weight-bold">{{ row.rank }}</span>
              <v-chip v-else size="x-small" variant="tonal" color="grey">needs {{ row.gamesNeeded }}</v-chip>
            </td>
            <td>
              <div class="d-flex align-center ga-2">
                <club-crest :code="dir.code(row.clubId)" :size="22" />
                <router-link v-if="clubLink" :to="clubLink(row.clubId)" class="rt-club">{{ dir.name(row.clubId) }}</router-link>
                <span v-else class="rt-club">{{ dir.name(row.clubId) }}</span>
              </div>
            </td>
            <td v-for="col in columns" :key="col.key" class="text-right" :class="{ 'rt-lead': col.lead }">
              {{ col.value(row) }}
            </td>
          </tr>
        </template>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="text-center text-medium-emphasis py-4">No results yet</td>
        </tr>
      </tbody>
    </v-table>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { RankingTableRow } from '@repo/api-contract';
import ClubCrest from './club-crest.vue';
import { useClubDirectory } from '@/helpers/open-play';

/** A stage table ordered into Ranks. Columns follow the stage's metric
 * (a goals-scored competition leads with GF). */
const props = withDefaults(
  defineProps<{
    rows: RankingTableRow[];
    metric: string;
    minGamesToRank?: number;
    highlightClubId?: string | null;
    /** Clubs above this line advance (drawn as a line). */
    advanceTop?: number | null;
    /** Tint the top/bottom N ranks (promotion / relegation outcomes). */
    upZone?: number;
    downZone?: number;
    title?: string;
    clubLink?: ((clubId: string) => string) | null;
    /** Narrow panels: only P, W, D, L, the ranking metric and points. */
    compact?: boolean;
  }>(),
  { minGamesToRank: 0, highlightClubId: null, advanceTop: null, upZone: 0, downZone: 0, title: '', clubLink: null, compact: false }
);

const dir = useClubDirectory();
const firstUnranked = computed(() => {
  const i = props.rows.findIndex((r) => r.rank == null);
  return i <= 0 && props.rows[0]?.rank != null ? -1 : i;
});
const ranked = computed(() => props.rows.filter((r) => r.rank != null).length);
function zoneOf(rank: number | null) {
  if (rank == null) return null;
  if (props.upZone && rank <= props.upZone) return 'up';
  if (props.downZone && rank > ranked.value - props.downZone) return 'down';
  return null;
}

type Col = { key: string; label: string; value: (r: RankingTableRow) => string | number; lead?: boolean };
const ppg = (r: RankingTableRow) => (r.played ? (r.points / r.played).toFixed(2) : '0.00');
const base: Col[] = [
  { key: 'played', label: 'P', value: (r) => r.played },
  { key: 'wins', label: 'W', value: (r) => r.wins },
  { key: 'draws', label: 'D', value: (r) => r.draws },
  { key: 'losses', label: 'L', value: (r) => r.losses },
  { key: 'gf', label: 'GF', value: (r) => r.gf },
  { key: 'ga', label: 'GA', value: (r) => r.ga },
  { key: 'gd', label: 'GD', value: (r) => (r.gd > 0 ? `+${r.gd}` : r.gd) },
  { key: 'points', label: 'Pts', value: (r) => r.points },
];
const extra: Record<string, Col> = {
  ppg: { key: 'ppg', label: 'PPG', value: ppg },
  'clean-sheets': { key: 'cs', label: 'CS', value: (r) => r.cleanSheets },
  'unbeaten-run': { key: 'ub', label: 'Unb.', value: (r) => r.bestUnbeatenRun },
  'win-rate': { key: 'wr', label: 'Win %', value: (r) => (r.played ? Math.round((r.wins / r.played) * 100) : 0) },
};
const LEAD_KEY: Record<string, string> = { points: 'points', wins: 'wins', gd: 'gd', gf: 'gf', 'ga-low': 'ga', played: 'played' };
const columns = computed<Col[]>(() => {
  const cols: Col[] = base.map((c) => ({ ...c, lead: LEAD_KEY[props.metric] === c.key }));
  const add = extra[props.metric];
  if (add) cols.push({ ...add, lead: true });
  if (props.metric !== 'ppg') cols.push({ ...extra.ppg!, lead: false });
  if (props.rows.some((r) => r.forfeits > 0)) cols.push({ key: 'ff', label: 'FF', value: (r) => r.forfeits });
  if (props.compact) return cols.filter((c) => c.lead || ['played', 'wins', 'draws', 'losses', 'points'].includes(c.key));
  return cols;
});
</script>

<style scoped>
.rt-table {
  background: transparent !important;
}
.rt-lead {
  font-weight: 700;
  color: #ffc107;
}
.rt-mine td {
  background: rgba(63, 81, 181, 0.25);
}
.rt-up td:first-child {
  box-shadow: inset 3px 0 0 #4caf50;
}
.rt-down td:first-child {
  box-shadow: inset 3px 0 0 #e53935;
}
.rt-divider td,
.rt-advance-line td {
  height: 0 !important;
  padding: 2px 8px !important;
}
.rt-advance-line td {
  border-bottom: 2px dashed rgba(255, 193, 7, 0.6) !important;
}
.rt-club {
  color: inherit;
  text-decoration: none;
}
</style>
