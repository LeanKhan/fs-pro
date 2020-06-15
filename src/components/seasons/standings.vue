<template>
  <v-card>
    <v-card-title class="subtitle-2">
      Week {{ WeekStandings.Week }}
    </v-card-title>
    <v-data-table
      :headers="headers"
      :items="WeekStandings.Table"
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

@Component({
  name: 'Standings',
})
export default class Standings extends Vue {
  @Prop({ required: true }) WeekStandings!: any;

  /**
   * {"_id":"5ede339735e29f6488edf4e8","ClubCode":"RP","Points":0,"Played":0,"Wins":0,"Losses":0,"Draws":0,"GF":0,"GA":0,"GD":0}
   */

  private headers: any[] = [
    {
      text: 'Club',
      align: 'start',
      value: 'ClubCode',
      filterable: false,
      sortable: false,
    },
    {
      text: 'Points',
      value: 'Points',
      filterable: false,
      sortable: false,
    },
    {
      text: 'Played',
      value: 'Played',
      filterable: false,
      sortable: false,
    },
    { text: 'Wins', value: 'Wins', filterable: false, sortable: false },
    { text: 'Losses', value: 'Losses', filterable: false, sortable: false },
    { text: 'Draws', value: 'Draws', filterable: false, sortable: false },
    { text: 'GF', value: 'GF', filterable: false, sortable: false },
    { text: 'GA', value: 'GA', filterable: false, sortable: false },
    { text: 'GD', value: 'GD', filterable: false, sortable: false },
  ];
}
</script>

<style></style>
