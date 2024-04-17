<template>
  <v-card>
    <v-card-title v-if="weekly" class="subtitle-2">
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
        <v-icon>${{ item.ClubCode }}</v-icon>
      </template>
    </v-data-table>
  </v-card>
</template>

<script lang="ts">
// import { Component, Vue, }
import { Component, Vue, Prop } from 'vue-property-decorator';
import { WeekStandings as IWeek } from '@/interfaces/season.ts';

@Component({
  name: 'Standings',
})
export default class Standings extends Vue {
  @Prop({ required: true }) WeekStandings!: IWeek;
  @Prop({ required: false, default: false }) weekly!: boolean;

  // private Table: IWeek['Table'] =
   // this.WeekStandings.Table || this.WeekStandings;

  private headers: any[] = [
    {
      text: 'Club',
      align: 'start',
      value: 'ClubCode',
      filterable: false,
      sortable: false,
    },
    {
      text: 'Played',
      value: 'Played',
      filterable: false,
      sortable: true,
    },
    { text: 'Wins', value: 'Wins', filterable: false, sortable: true },
    { text: 'Losses', value: 'Losses', filterable: false, sortable: true },
    { text: 'Draws', value: 'Draws', filterable: false, sortable: true },
    { text: 'GF', value: 'GF', filterable: false, sortable: true },
    { text: 'GA', value: 'GA', filterable: false, sortable: true },
    { text: 'GD', value: 'GD', filterable: false, sortable: true },
    {
      text: 'Points',
      value: 'Points',
      filterable: false,
      sortable: true,
    },
  ];

  get SortedTable() {
    return this.Table.sort((a, b) => {
      if (b.Points === a.Points) {
        if (b.GD === a.GD) {
          return b.GF - a.GF;
        } else {
          return b.GD - a.GD;
        }
      }
      return b.Points - a.Points;
    });
  }

  get Table() {
    return this.WeekStandings.Table || this.WeekStandings;
  }

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
}
</script>

<style></style>
