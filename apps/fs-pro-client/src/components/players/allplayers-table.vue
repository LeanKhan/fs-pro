<template>
  <v-card>
    <v-card-title>
      Add Player to Club
      <v-spacer></v-spacer>

      <v-text-field
        v-model="search"
        append-icon="mdi-magnify"
        label="Search"
        single-line
        hide-details
      ></v-text-field>
    </v-card-title>

    <v-data-table
      :headers="headers"
      :items="players"
      v-model="selectedPlayer"
      item-key="_id"
      show-select
      :search="search"
      loading-text="Fetching Players..."
      no-data-text="No Players"
      class="elevation-1"
    >

 <template v-slot:top>
      <v-switch
        v-model="singleSelect"
        label="Single select"
        class="pa-3"
      ></v-switch>
    </template>

      <template v-slot:item.Id="{ item }">
        <v-list-item-avatar v-if="item.ClubCode">
          <v-img
            :src="`${api}/img/clubs/kit/${item.ClubCode}-kit.png`"
            height="40px"
          ></v-img>
        </v-list-item-avatar>
      </template>

      <!-- Player's Country -->
      <!-- <template v-slot:item.Country="{ item }">
        {{ item.Nationality ? item.Nationality.Name : "-" }}
      </template> -->

      <template v-slot:item.Rating="{ item }">
        <v-chip :color="getColor(item.Rating)" dark>
          {{ Math.round(item.Rating) }}
        </v-chip>
      </template>
    </v-data-table>
    <v-divider></v-divider>
    <v-card-actions>
      <v-spacer></v-spacer>
      <v-btn color="secondary" @click="close">
        Close
      </v-btn>
      <v-btn color="success" v-if="selectedPlayer[0]" @click="addPlayer">
        Add
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Player } from '@/interfaces/player';
import { apiUrl } from '@/store';

@Component({})
export default class AllPlayersTable extends Vue {
  //   @Prop({ required: true }) readonly clubs!: Club;
  private api = apiUrl;
  private players: any[] = [];

  private selectedPlayer: Player[] | [] = [];

  private singleSelect = false;

  private headers: any[] = [
    {
      text: 'Id',
      align: 'start',
      value: 'Id'
    },

    {
      text: 'First Name',
      value: 'FirstName',
    },
    {
      text: 'Last Name',
      value: 'LastName',
    },
    { text: 'Club', value: 'ClubCode', filterable: true },
    { text: 'Age', value: 'Age', filterable: true },
    { text: 'Position', value: 'Position', filterable: true },
    { text: 'Role', value: 'Role', filterable: true },
    { text: 'Country', value: 'Nationality.Name', filterable: true },
    { text: 'Value', value: 'Value', filterable: false },
    { text: 'Rating', value: 'Rating', filterable: true },
  ];

  private search = '';

  private ClubCode = '';

  private isSigned = null;

  public getColor(rating: number): string {
    if (rating >= 80) return 'green';
    else if (rating >= 50) return 'orange';
    else return 'red';
  }

  private addPlayer(): void {

  // get array of Ids
  const playerIds = this.selectedPlayer.map(p => p._id);

    this.$emit('close-players-modal', playerIds);
    this.selectedPlayer = [];
  }

  private close(): void {
    this.$emit('close-players-modal');
  }

  private mounted() {
    const options = JSON.stringify({ isSigned: false });
    this.$axios
      .get(`/players/all?options=${options}`)
      .then(res => {
        this.players = res.data.payload as Player[];
      })
      .catch(err => {
        console.log('Error! => ', err);
      });
  }
}
</script>

<style></style>
