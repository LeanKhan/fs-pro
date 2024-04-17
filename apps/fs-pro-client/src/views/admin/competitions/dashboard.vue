<template>
  <div>
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-card-title>
            Competitions
            <v-spacer></v-spacer>
            <v-btn append-icon="mdi-plus" color="success" to="competitions/new">
              New
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
              {{ item.Clubs.length }}
            </template>

            <template v-slot:item.Country="{ item }">
              {{ item.Country.Name }}
            </template>

            <template v-slot:item.Seasons="{ item }">
              {{ item.Seasons.length }}
            </template>

            <!-- TODO: Add these titles *everywhere* -->
            <template v-slot:item.Actions="{ item }">
              <v-btn
                text
                icon
                color="success lighten-2"
                title="View Competition"
              >
                <v-icon small @click="viewCompetition(item)">
                  mdi-eye
                </v-icon>
              </v-btn>
              <v-btn
                text
                icon
                color="blue lighten-2"
                title="Update Competition"
              >
                <v-icon small @click="updateCompetition(item)">
                  mdi-pencil
                </v-icon>
              </v-btn>
            </template>
          </v-data-table>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>
<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Competition } from '@/interfaces/competition';

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
    { text: 'Actions', value: 'Actions', sortable: false, filterable: false },
  ];

  //   TODO: Add a filter by competition type...
  // it can be a select menu :)...

  private competitions: Competition[] = [];

  private search = '';

  public viewCompetition(comp: Competition): void {
    const compCode = comp.CompetitionCode.toLowerCase();
    const compID = comp._id?.toLowerCase();

    this.$router.push({
      name: 'View Competition',
      params: { id: compID as string, code: compCode },
    });
  }

  public updateCompetition(comp: Competition): void {
    const compCode = comp.CompetitionCode.toLowerCase();
    const compID = comp._id?.toLowerCase();

    this.$router.push({
      name: 'Update Competition',
      params: { id: compID as string, code: compCode },
    });
  }

  public newCompetition(): void {
    this.$router.push({ name: 'New Competition' });
  }

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
<style scoped>
table tr {
  cursor: pointer !important;
}
table tr:active {
  background-color: #3f51b5 !important;
  border-color: #3f51b5 !important;
}
</style>
