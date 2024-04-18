<template>
  <v-card elevation="2" class="pa-2" color="green accent-2">
    <v-toolbar>
      Best Players
      <v-icon>mdi-chart-areaspline</v-icon>
    </v-toolbar>
    <v-row>
      <template v-for="(attr, k) in stats_attributes">
        <v-col cols="6" v-bind:key="k">
          <v-card color="green accent-1">
            <v-card-title class="capitalize subtitle-1 black--text">
              Highest {{ attr }}
            </v-card-title>

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

            <v-sheet class="pa-2" v-else>
              <v-btn
                block
                depressed
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
  </v-card>
</template>

<script lang="ts">
/* eslint-disable @typescript-eslint/camelcase */
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component({})
export default class PlayerStats extends Vue {
  // after end of season, check if the Year is alos over (that is, all the seasons are finished...)
  // then go to End Of Year...
  //   @Prop({ required: true }) stats_attributes!: string[];
  @Prop({ required: true }) seasonId!: string;

  private loading = false;

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
}
</script>

<style></style>
