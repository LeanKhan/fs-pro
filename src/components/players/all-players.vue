<template>
  <v-card>
    <v-card-title>
      All Players
      <v-spacer></v-spacer>
      <v-text-field
        v-model="search"
        append-icon="mdi-magnify"
        label="Search"
        single-line
        hide-details
      ></v-text-field>
      <v-checkbox v-model="isSigned" label="Signed">
        Signed
      </v-checkbox>
    </v-card-title>
    <v-data-table
      :headers="headers"
      :items="players"
      :loading="!players.length > 0"
      :search="search"
      loading-text="Fetching Players..."
      class="elevation-1"
    >
      <template v-slot:item.Rating="{ item }">
        <v-chip :color="getColor(item.Rating)" dark>
          {{ Math.round(item.Rating) }}
        </v-chip>
      </template>

      <template v-slot:item.isSigned="{ item }">
        <v-chip
          style="background-color: transparent;"
          :color="item.isSigned ? 'green' : 'orange'"
        >
          {{ item.isSigned }}
        </v-chip>
      </template>
    </v-data-table>
  </v-card>
</template>
<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Player } from '../../models/player';

@Component({})
export default class AllPlayers extends Vue {
  private headers: any[] = [
    {
      text: 'First Name',
      align: 'start',
      value: 'FirstName',
    },
    {
      text: 'Last Name',
      value: 'LastName',
    },
    { text: 'Club', value: 'ClubCode' },
    { text: 'Age', value: 'Age', filterable: false },
    { text: 'Position', value: 'Position', filterable: false },
    { text: 'Country', value: 'Nationality', filterable: false },
    { text: 'Value', value: 'Value', filterable: false },
    {
      text: 'Signed',
      value: 'isSigned',
      sortable: false,
      filter: (value: boolean) => {
        if (!this.isSigned) return true;

        return value == this.isSigned;
      },
    },
    { text: 'Rating', value: 'Rating', filterable: false },
  ];

  private players: Player[] = [];

  private search = '';

  private isSigned = null;

  public getColor(rating: number): string {
    if (rating >= 80) return 'green';
    else if (rating >= 50) return 'orange';
    else return 'red';
  }

  public mounted() {
    this.$axios
      .get('/players/all')
      .then(res => {
        this.players = res.data.payload;
      })
      .catch(err => {
        console.log('Error! => ', err);
      });
  }
}
</script>
<style scoped></style>
