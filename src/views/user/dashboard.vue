<template>
  <div>
    <v-toolbar>
      <!-- Current day -->
      <v-toolbar-title>
        Current year
        <span class="subtitle-1 font-weight-bold indigo--text">
          {{ calendar.YearString }}
        </span>
      </v-toolbar-title>
    </v-toolbar>

    <!-- Main -->

    <v-row>
      <v-col cols="8">
        <!-- Fixtures and next matches -->
        <v-card color="transparent">
          <v-sheet width="100%" color="indigo">
            <div class="text-center">
              <template v-if="!selectedDay.isFree">
                <v-row class="px-6">
                  <v-col cols="6">
                    <v-card>
                      <v-card-subtitle>
                        {{ selectedDay.Matches[0].Competition }}
                        <v-icon small color="amber lighten-3">
                          mdi-trophy
                        </v-icon>
                      </v-card-subtitle>

                      <v-card-text>
                        <v-avatar>
                          <v-icon>
                            ${{ selectedDay.Matches[0].Fixture.Home }}
                          </v-icon>
                        </v-avatar>
                        vs
                        <v-avatar>
                          <v-icon>
                            ${{ selectedDay.Matches[0].Fixture.Away }}
                          </v-icon>
                        </v-avatar>

                        <div class="pa-0 text-center">
                          <p class="mb-2 caption white--text">
                            {{ selectedDay.Matches[0].Fixture.Title }}
                          </p>

                          <p class="mb-0 caption">
                            {{ selectedDay.Matches[0].Fixture.Stadium }}
                          </p>
                        </div>
                      </v-card-text>
                    </v-card>
                  </v-col>

                  <v-col cols="6">
                    <v-card>
                      <v-card-subtitle>
                        {{ selectedDay.Matches[1].Competition }}
                        <v-icon small color="amber lighten-3">
                          mdi-trophy
                        </v-icon>
                      </v-card-subtitle>

                      <v-card-text>
                        <v-avatar>
                          <v-icon>
                            ${{ selectedDay.Matches[1].Fixture.Home }}
                          </v-icon>
                        </v-avatar>
                        vs
                        <v-avatar>
                          <v-icon>
                            ${{ selectedDay.Matches[1].Fixture.Away }}
                          </v-icon>
                        </v-avatar>

                        <div class="pa-0 text-center">
                          <p class="mb-2 caption white--text">
                            {{ selectedDay.Matches[1].Fixture.Title }}
                          </p>

                          <p class="mb-0 caption">
                            {{ selectedDay.Matches[1].Fixture.Stadium }}
                          </p>
                        </div>
                      </v-card-text>
                    </v-card>
                  </v-col>
                </v-row>
              </template>

              <template v-else>
                <div>
                  No matches today! :)
                </div>
              </template>
            </div>
          </v-sheet>

          <!-- Fixtures scroller -->

          <v-sheet width="100%" color="dark" class="mt-5">
            <v-col cols="12">
              <day-scroll
                :days="calendar.Days"
                @selected-day-index-changed="doSomething"
              ></day-scroll>
            </v-col>
          </v-sheet>
        </v-card>

        <!-- Standings and other stuff -->
        <v-card class="mt-3">
          <div class="text-center">
            <template v-if="seasons">
              <v-tabs fixed-tabs v-model="seasonTab" dark>
                <v-tab v-for="(season, i) in seasons" :key="i">
                  {{ season.CompetitionCode }}
                </v-tab>
              </v-tabs>

              <v-tabs-items v-model="seasonTab">
                <v-tab-item v-for="(season, i) in seasons" :key="i">
                  <standings-scroller
                    :standings="season.Standings"
                  ></standings-scroller>
                </v-tab-item>
              </v-tabs-items>
            </template>
          </div>
        </v-card>
      </v-col>
      <v-col cols="4">
        <v-card>
          <v-sheet height="400px" width="100%" color="green darken-2">
            <div class="text-center">
              Other informational stuff like chats, messages and events
            </div>
          </v-sheet>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Socket } from 'vue-socket.io-extended';
import DayScroll from '../../components/calendar/day-scroll.vue';
import StandingsScroller from '@/components/seasons/standings-scroller.vue';
@Component({
  components: {
    DayScroll,
    StandingsScroller,
  },
})
export default class UserDashboard extends Vue {
  @Socket('match-event')
  onMatchEvent(event: any) {
    this.events.push(event);
  }

  @Socket('match-started')
  onMatchStarted() {
    console.log('<===== Match Started =====>');
  }

  @Socket('match-ended')
  onMatchEnded(match: any) {
    this.match = match;
  }

  private events: any[] = [];

  private match: any = {};

  private selectedDayIndex = 0;

  private seasonTab = null;

  private seasons: any = {};

  get calendar() {
    return this.$store.state.calendar;
  }

  private getSeasons() {
    this.$axios
      .get('/seasons/current?year=JUN-2020')
      .then(response => {
        this.seasons = response.data.payload;
      })
      .catch(error => {
        console.log('Error getting current seasons!', error);
      });
  }

  private doSomething(val: number) {
    this.selectedDayIndex = val;
  }

  get selectedDay() {
    return this.calendar.Days[this.selectedDayIndex];
  }

  mounted() {
    this.getSeasons();
  }
}
</script>

<style></style>
