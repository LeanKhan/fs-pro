<template>
  <v-card>
    <v-card-title v-if="weekly" class="text-subtitle-2">
      Week {{ WeekStandings.Week }}
    </v-card-title>
    <v-data-table
      :headers="headers"
      :items="SortedTable"
      item-key="ClubCode"
      class="elevation-1"
      disable-pagination
      hide-default-footer
    >
      <template v-slot:item.Pos="{ item }">
        <div class="d-flex align-center">
          <span class="text-caption mr-1">{{ item.Pos }}</span>
          <v-icon
            v-if="(movement?.[item.ClubCode] ?? 0) > 0"
            size="x-small"
            color="success"
            :title="`Up ${movement?.[item.ClubCode]}`"
            >mdi-arrow-up</v-icon
          >
          <v-icon
            v-else-if="(movement?.[item.ClubCode] ?? 0) < 0"
            size="x-small"
            color="error"
            :title="`Down ${Math.abs(movement?.[item.ClubCode] ?? 0)}`"
            >mdi-arrow-down</v-icon
          >
          <v-icon v-else-if="movement" size="x-small" color="grey"
            >mdi-minus</v-icon
          >
        </div>
      </template>
      <template v-slot:item.ClubCode="{ item }">
        <router-link
          v-if="item.ClubID"
          :to="`/u/clubs/${item.ClubID}/${item.ClubCode}`"
          class="d-flex align-center gap-2 text-decoration-none text-white font-weight-bold"
          title="View Club Public Profile"
        >
          <v-icon size="small">custom:{{ item.ClubCode }}</v-icon>
          <span class="text-caption font-weight-bold">{{ item.ClubCode }}</span>
        </router-link>
        <div v-else class="d-flex align-center gap-2">
          <v-icon size="small">custom:{{ item.ClubCode }}</v-icon>
          <span class="text-caption font-weight-bold">{{ item.ClubCode }}</span>
        </div>
      </template>
    </v-data-table>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { WeekStandings as IWeek } from '@repo/api-contract';

interface Props {
  WeekStandings: IWeek;
  weekly?: boolean;
  /** ClubCode -> positions gained (+) / lost (-); omit to hide arrows. */
  movement?: Record<string, number>;
}

const props = withDefaults(defineProps<Props>(), {
  weekly: false,
});

const headers = ref<any[]>([
  { title: '#', key: 'Pos', sortable: false, filterable: false },
  {
    title: 'Club',
    align: 'start',
    key: 'ClubCode',
    filterable: false,
    sortable: false,
  },
  {
    title: 'Played',
    key: 'Played',
    filterable: false,
    sortable: true,
  },
  { title: 'Wins', key: 'Wins', filterable: false, sortable: true },
  { title: 'Losses', key: 'Losses', filterable: false, sortable: true },
  { title: 'Draws', key: 'Draws', filterable: false, sortable: true },
  { title: 'GF', key: 'GF', filterable: false, sortable: true },
  { title: 'GA', key: 'GA', filterable: false, sortable: true },
  { title: 'GD', key: 'GD', filterable: false, sortable: true },
  {
    title: 'Points',
    key: 'Points',
    filterable: false,
    sortable: true,
  },
]);

const Table = computed(() => {
  return props.WeekStandings;
});

const SortedTable = computed(() => {
  const rows = Array.isArray(Table.value) ? Table.value : (Table.value as any).Table ?? [];
  return [...rows]
    .sort((a: any, b: any) => {
    if (b.Points === a.Points) {
      if (b.GD === a.GD) {
        return b.GF - a.GF;
      } else {
        return b.GD - a.GD;
      }
    }
    return b.Points - a.Points;
  })
    .map((row: any, i: number) => ({ ...row, Pos: i + 1 }));
});

//   get totalTable() {
//     let total = [];

//     Array.from(new Set(this.SortedTable.map(x => x.ClubCode))).forEach(x => {
//       total.push(this.SortedTable.filter(y => y.ClubCode === x).reduce((output, item) => {
//         let val = output[x] === undefined ? 0 : output[x];
//         output[x] = (item.value + val);
//         return output;
//       }, {}))
//     })
// }
</script>

<style></style>
