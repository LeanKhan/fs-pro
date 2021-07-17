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
            <v-btn :to="`/finish/season/${season._id}`">
              View Stats
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
        <template v-if="season.Standings && season.Standings.length > 0">
          <v-card>
            <v-card-title>
              Standings (Table)
            </v-card-title>
            <v-card-text>
              <standings-scroller
                :standings="season.Standings"
              ></standings-scroller>
            </v-card-text>
          </v-card>
        </template>

        <template v-else>
          <span>No Standings yet</span>
        </template>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12">
        <v-card>
          <v-card-title>
            Fixtures
          </v-card-title>
          <fixtures-table :fixtures="season.Fixtures"></fixtures-table>
          <!-- <v-sheet
            class="text-center"
            color="secondary secondary-lighten"
            height="250"
          >
            <span>
              Season is not activated
            </span>
          </v-sheet> -->
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

      <v-col cols="12">
        <v-card>
          <v-card-title>
            Settings
          </v-card-title>
          <v-sheet color="secondary secondary-lighten">
            <v-btn @click="deleteSeason">Delete Season</v-btn>
          </v-sheet>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Season } from '@/interfaces/season';
import StandingsScroller from '@/components/seasons/standings-scroller.vue';
import FixturesTable from '@/components/seasons/fixtures-table.vue';

@Component({
  components: {
    StandingsScroller,
    FixturesTable,
  },
})
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

  private startSeason(): void {
    // ... fish ...
    console.log('Starting Season...');
  }

  private deleteSeason() {
    const seasonID = this.$route.params['seasonId'];

    const ans = confirm(
      "Yo, are you ABSOLUTELY SURE ABOUT THIS!\nYou really want to delete this Season and everything about it?\nAll Fixtures will be deleted too.\n Last chance. You can't undo this."
    );

    if (ans) {
      this.$axios
        .delete(`/seasons/${seasonID}`)
        .then(res => {
          console.log('Season deleted successfully :)', res);

          this.$router.back();
        })
        .catch(response => {
          console.log('Error => ', response);
        });
    }
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
