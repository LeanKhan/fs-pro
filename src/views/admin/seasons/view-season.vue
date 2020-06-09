<template>
  <div>
    <v-row>
      <v-col cols="12">
        <v-card>
          <div class="overline">
            {{ season.SeasonCode }}
          </div>
          <v-card-title>
            {{ season.Title }} Season
            <v-chip class="mx-2" :color="season.isStarted ? 'green' : 'orange'">
              {{ season.isStarted ? 'Started' : 'Not Started' }}
            </v-chip>
          </v-card-title>

          <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn v-if="!season.isStarted" @click="generateFixtures">
              Generate Fixtures
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>

      <v-col>
        <v-card>
          <v-sheet color="green green-lighten" height="100"></v-sheet>
        </v-card>
      </v-col>

      <v-col>
        <v-card>
          <v-sheet color="green green-lighten" height="100"></v-sheet>
        </v-card>
      </v-col>

      <v-col>
        <v-card>
          <v-sheet color="green green-lighten" height="100"></v-sheet>
        </v-card>
      </v-col>

      <v-col>
        <v-card>
          <v-sheet color="green green-lighten" height="100"></v-sheet>
        </v-card>
      </v-col>
    </v-row>
    <v-row>
      <v-col cols="6">
        <v-card>
          <v-card-title>
            Calendar
          </v-card-title>
          <v-sheet color="purple purple-lighten-1" height="180">
            Nothing here...
          </v-sheet>
        </v-card>
      </v-col>
      <v-col cols="6">
        <v-card>
          <v-card-title>
            Standings (Table)
          </v-card-title>
          <v-sheet color="blue blue-lighten-1" height="180">
            Nothing here...
          </v-sheet>
        </v-card>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12">
        <v-card>
          <v-card-title>
            Fixtures
          </v-card-title>
          <v-sheet
            class="text-center"
            color="secondary secondary-lighten"
            height="250"
          >
            <span>
              Season is not activated
            </span>
          </v-sheet>
        </v-card>
      </v-col>
      <v-col cols="12">
        <v-card>
          <v-card-title>
            Player Stats (Records)
          </v-card-title>
          <v-sheet color="secondary secondary-lighten" height="250"></v-sheet>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Season } from '@/models/season';

@Component({})
export default class ViewSeason extends Vue {
  private season: any = {};

  private generateFixtures(): void {
    const seasonId = this.$route.params['seasonId'];
    const leagueCode = this.$route.params['code'];
    const competitionId = this.$route.params['id'];

    const data = { competitionId, leagueCode, seasonId };
    this.$axios
      .post(
        `/seasons/${seasonId}/${this.season.SeasonCode}/generate-fixtures`,
        { data }
      )
      .then(response => {
        this.season = response.data.payload as Season;
        console.log('Fixtures generated! => ', response.data.payload);
      })
      .catch(response => {
        console.log('Error generating Fixtures=> ', response);
      });
  }

  private mounted(): void {
    const seasonID = this.$route.params['seasonId'];
    this.$axios
      .get(`/seasons/${seasonID}`)
      .then(response => {
        this.season = response.data.payload as Season;
      })
      .catch(response => {
        console.log('Error => ', response);
      });
  }
}
</script>

<style></style>
