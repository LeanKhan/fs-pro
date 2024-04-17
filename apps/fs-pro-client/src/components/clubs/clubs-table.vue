<template>
  <v-card>
    <v-card-title>
      Add Club to competition
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
      :items="clubs"
      v-model="selectedClub"
      item-key="ClubCode"
      show-select
      :single-select="true"
      :search="search"
      loading-text="Fetching Clubs..."
      no-data-text="No Clubs"
      class="elevation-1"
    >
      <!-- <template v-slot:item.Actions="{ item }">
        <v-btn text icon color="success lighten-2">
          <v-icon small @click="viewSeason(item)">
            mdi-eye
          </v-icon>
        </v-btn>
        <v-btn text icon color="blue lighten-2">
          <v-icon small @click="editSeason(item)">
            mdi-pencil
          </v-icon>
        </v-btn>
      </template> -->

      <template v-slot:item.Address="{ item }">
        {{ item.Address.City }}, {{ item.Address.Country.Name }}
      </template>

      <template v-slot:item.Stadium="{ item }">
        {{ item.Stadium.Name }}
      </template>

      <template v-slot:item.Players="{ item }">
        {{ item.Players.length }}
      </template>
    </v-data-table>
    <v-divider></v-divider>
    <v-card-actions>
      <v-spacer></v-spacer>
      <v-btn color="secondary" @click="close">
        Close
      </v-btn>
      <v-btn color="success" v-if="selectedClub[0]" @click="addClub">
        Add
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Club } from '@/interfaces/club';

@Component({})
export default class ClubsTable extends Vue {
  //   @Prop({ required: true }) readonly clubs!: Club;

  private clubs: any[] = [];

  private selectedClub: Club[] | [] = [];

  private headers: any[] = [
    {
      text: 'Code',
      align: 'start',
      value: 'ClubCode',
    },
    {
      text: 'Name',
      value: 'Name',
    },
    { text: 'Address', value: 'Address', filterable: true, sortable: true },
    { text: 'Manager', value: 'Manager', filterable: true, sortable: false },
    { text: 'Stadium', value: 'Stadium', filterable: true, sortable: false },
    { text: 'League', value: 'LeagueCode', filterable: true, sortable: true },
    { text: 'Players', value: 'Players', filterable: true, sortable: true },
  ];

  private search = '';

  private addClub(): void {
    this.$emit('close-club-modal', {
      id: this.selectedClub[0]._id,
      name: this.selectedClub[0].Name,
    });
  }

  private close(): void {
    this.$emit('close-club-modal');
  }

  private mounted() {
    this.$axios
      .get('/clubs/all')
      .then(res => {
        this.clubs = res.data.payload as Club[];
      })
      .catch(err => {
        console.log('Error! => ', err);
      });
  }
}
</script>

<style></style>
