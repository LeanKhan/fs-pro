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
      item-key="PlayerID"
      show-select
      :single-select="true"
      :search="search"
      loading-text="Fetching Players..."
      no-data-text="No Players"
      class="elevation-1"
    >
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

@Component({})
export default class AllPlayersTable extends Vue {
  //   @Prop({ required: true }) readonly clubs!: Club;

  private players: any[] = [];

  private selectedPlayer: Player[] | [] = [];

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
    { text: 'Rating', value: 'Rating', filterable: false },
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
    this.$emit('close-players-modal', this.selectedPlayer[0]._id);
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
