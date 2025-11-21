<template>
  <v-card>
    <v-card-title v-if="weekly" class="text-subtitle-2">
      Week {{ WeekStandings.Week }}
    </v-card-title>
    <v-data-table
      :headers="headers"
      :items="SortedTable"
      item-key="ClubCode"
      no-data-text="No Standings for this week..."
      class="elevation-1"
      disable-pagination
      hide-default-footer
    >
      <template v-slot:item.ClubCode="{ item }">
        <v-icon>custom:{{ item.ClubCode }}</v-icon>
      </template>
    </v-data-table>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { WeekStandings as IWeek } from '@/interfaces/season';

interface Props {
  WeekStandings: IWeek;
  weekly?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  weekly: false,
});

// private Table: IWeek['Table'] =
// props.WeekStandings.Table || props.WeekStandings;

const headers = ref<any[]>([
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
  return props.WeekStandings.Table || props.WeekStandings;
});

const SortedTable = computed(() => {
  return [...Table.value].sort((a: any, b: any) => {
    if (b.Points === a.Points) {
      if (b.GD === a.GD) {
        return b.GF - a.GF;
      } else {
        return b.GD - a.GD;
      }
    }
    return b.Points - a.Points;
  });
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
