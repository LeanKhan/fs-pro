<template>
  <div id="end-of-season">
    <v-container v-if="season" fluid class="pa-0">
      <v-toolbar dense color="dark">
        <v-toolbar-title class="mx-auto">
          {{ season.Year }} {{ season.CompetitionCode }} Season Statistics
        </v-toolbar-title>

        <v-spacer></v-spacer>

        <v-btn depressed small icon @click="close()">
          <v-icon>
            mdi-close
          </v-icon>
        </v-btn>
      </v-toolbar>

      <v-row>
        <template v-for="(attr, k) in stats_attributes">
          <v-col cols="3" v-bind:key="k">
            <v-card>
              <v-card-title class="capitalize">Highest {{ attr }}</v-card-title>

              <v-list v-if="top_players[attr].length > 0">
                <v-list-item v-for="(p, i) in top_players[attr]" :key="i">
                  <v-list-item-avatar>
                    <v-icon style="font-size: 30px; height: 30px" large>
                      ${{ p.player.ClubCode }}
                    </v-icon>
                  </v-list-item-avatar>
                  <v-list-item-title>
                    {{ p.player.FirstName }} {{ p.player.LastName }}
                  </v-list-item-title>

                  <v-list-item-avatar size="40px" color="blue">
                    <span class="white--text font-weight-bold">
                      {{ p[attr] | roundTo(2) }}
                    </span>
                  </v-list-item-avatar>
                </v-list-item>
              </v-list>

              <v-sheet v-else>
                <v-btn
                  :disabled="loading_player_stats"
                  :loading="loading_player_stats"
                  @click="load_stats(attr)"
                >
                  Load
                </v-btn>
              </v-sheet>
            </v-card>
          </v-col>
        </template>
      </v-row>
    </v-container>

    <!-- loading overlay -->
    <v-overlay :value="loading">
      <v-progress-circular indeterminate size="68"></v-progress-circular>
    </v-overlay>
  </div>
</template>

<script lang="ts">
/* eslint-disable @typescript-eslint/camelcase */
import { Component, Vue } from 'vue-property-decorator';
import Standings from '@/components/seasons/standings.vue';

@Component({
  components: {
    Standings,
  },
})
export default class SeasonStats extends Vue {
  // after end of season, check if the Year is alos over (that is, all the seasons are finished...)
  // then go to End Of Year...

  private loading = false;

  private season: any = {};

  private loading_player_stats = false;

  private stats_attributes = ['points', 'goals', 'assists', 'saves'];

  private top_players: {
    points: [];
    goals: [];
    assists: [];
    saves: [];
    [key: string]: [];
  } = {
    points: [],
    goals: [],
    assists: [],
    saves: [],
  };

  get seasonId() {
    return this.$route.params.season_id;
  }

  private close() {
    this.$router.push('/u');
  }

  // eslint-disable-next-line @typescript-eslint/camelcase
  private load_stats(attribute: string) {
    this.loading_player_stats = true;
    this.$axios
      .get(
        `/players/stats?match_k=season._id&match_v=${this.seasonId}&sort_k=${attribute}&sort_v=-1`
      )
      .then(response => {
        if (response.data.success) {
          this.top_players[attribute] = response.data.payload;
        }
      })
      .catch(err => {
        console.log(`Error fetching player with most ${attribute} => `, err);
      })
      .finally(() => {
        this.loading_player_stats = false;
      });
  }

  mounted() {
    console.log('Fetching Season...');
    this.loading = true;

    this.$axios
      .get(`/seasons/${this.seasonId}?populate=false`)
      .then(response => {
        this.season = response.data.payload;
      })
      .catch(err => {
        console.log('Error fetching Season => ', err);
      })
      .finally(() => {
        this.loading = false;
      });
  }
}
</script>

<style></style>
