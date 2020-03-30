<template>
  <div>
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-card-title>
            Competitions
            <v-spacer></v-spacer>
            <v-btn append-icon="mdi-plus" color="success">
              Add
            </v-btn>
          </v-card-title>
        </v-card>
      </v-col>

      <v-col cols="12">
        <v-card>
          <v-card-title>
            All Competitions
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
            :items="competitions"
            :loading="!competitions.length > 0"
            :search="search"
            loading-text="Fetching Competitions..."
            class="elevation-1"
          >
            <template v-slot:item.Clubs="{ item }">
              {{ item.length }}
            </template>

            <template v-slot:item.Seasons="{ item }">
              {{ item.length }}
            </template>
          </v-data-table>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>
<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Competition } from '../../models/competition';

@Component({})
export default class CompetitionsHome extends Vue {
  private headers: any[] = [
    { text: 'ID', value: 'CompetitionID', filterable: true },
    {
      text: 'Name',
      align: 'start',
      value: 'Name',
    },
    {
      text: 'Type',
      value: 'Type',
    },
    { text: 'Code', value: 'CompetitionCode' },
    { text: 'Teams', value: 'NumberOfTeams' },
    { text: 'Weeks', value: 'NumberOfWeeks', filterable: false },
    { text: 'Country', value: 'Country' },
    {
      text: 'Clubs',
      value: 'Clubs',
      filterable: false,
    },
    { text: 'Seasons', value: 'Seasons', filterable: false },
  ];

  //   TODO: Add a filter by competition type...
  // it can be a select menu :)...

  private competitions: Competition[] = [];

  private search = '';

  public mounted() {
    this.$axios
      .get('/competitions/all')
      .then(res => {
        this.competitions = res.data.payload;
      })
      .catch(err => {
        console.log('Error! => ', err);
      });
  }
}
</script>
<style scoped></style>
