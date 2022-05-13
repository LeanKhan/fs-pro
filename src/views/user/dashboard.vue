<template>
  <div>
    <v-toolbar>
      <!-- Current day -->
      <v-toolbar-title class="subtitle-1 font-weight-bold indigo--text">
        Day {{ calendar.CurrentDay + 1 }} - Year {{ calendar.YearString }}
      </v-toolbar-title>

      <v-toolbar-items>
        <v-btn
          color="warning"
          v-if="calendar.allSeasonsCompleted"
          @click="endYear()"
        >
          END YEAR
        </v-btn>
      </v-toolbar-items>
    </v-toolbar>

    <!-- Main -->

    <v-row>
      <v-col cols="8">
        <!-- Fixtures and next matches -->
        <v-card color="transparent">
          <v-sheet width="100%" color="indigo">
            <div class="text-center" v-if="selectedDay">
              <template v-if="!selectedDay.isFree">
                <v-row class="px-6">
                  <v-col cols="6">
                    <fixture-card
                      :Match="selectedDay.Matches[0]"
                    ></fixture-card>
                  </v-col>

                  <v-col cols="6">
                    <fixture-card
                      :Match="selectedDay.Matches[1]"
                    ></fixture-card>
                  </v-col>
                </v-row>
              </template>

              <template v-else>
                <v-card color="grey" height="190px">
                  <v-card-text>
                    No matches today
                    <v-icon>mdi-ball</v-icon>
                  </v-card-text>
                </v-card>
              </template>
            </div>
          </v-sheet>

          <!-- Fixtures scroller -->

          <v-sheet width="100%" color="dark" class="mt-5">
            <div>
              <v-subheader>
                Upcoming Fixtures
                <v-spacer></v-spacer>
                <v-btn depressed text small color="indigo" to="u/fixtures">
                  View All
                </v-btn>
              </v-subheader>
            </div>
            <v-col cols="12">
              <day-scroll
                :days="days"
                :singleLeague="false"
                @selected-day-index-changed="selectDay"
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
          <v-subheader>Season Stats</v-subheader>
          <v-list>
            <v-list-item three-line v-for="(s, i) in seasons" :key="i">
              <v-list-item-title>{{ s.CompetitionCode }}</v-list-item-title>
              <span>
                <v-btn :to="`/u/stats/season/${s._id}`">
                  View Stats
                  <v-icon class="ml-1" color="primary">
                    mdi-chart-areaspline
                  </v-icon>
                </v-btn>
              </span>
            </v-list-item>
          </v-list>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import DayScroll from '../../components/calendar/day-scroll.vue';
import StandingsScroller from '@/components/seasons/standings-scroller.vue';
import FixtureCard from '@/components/user-dashboard/fixture-card.vue';
@Component({
  components: {
    DayScroll,
    StandingsScroller,
    FixtureCard,
  },
})
export default class UserDashboard extends Vue {
  // @Socket('match-event')
  // onMatchEvent(event: any) {
  //   this.events.push(event);
  // }

  private match: any = {};

  private selectedDayIndex = 0;

  private seasonTab = null;

  private days: any = [];

  get currentDay() {
    return this.$store.state.calendar.CurrentDay;
  }

  get lobby() {
    return this.$store.getters.lobby;
  }

  get calendar() {
    return this.$store.state.calendar;
  }

  get seasons() {
    return this.$store.state.seasons;
  }

  get selectedDay() {
    return this.days[this.selectedDayIndex];
  }

  get yearString(): string {
    return this.$store.state.calendar.YearString;
  }

  @Watch('currentDay', { immediate: true })
  onCurrentDayChanged(day: number) {
    this.getDays(day);
  }

  @Watch('lobby', { immediate: true })
  onLobbyChange(toLobby: boolean) {
    if (toLobby) {
      this.$router.push('/u/lobby');
    }
  }

  private endYear() {
    this.$router.push(`/finish/year/${this.calendar._id}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private getDays(_day: number) {
    // if the currentDay is greater than 14 get the next page...
    const limit = 7;
    const week =
      this.calendar.CurrentDay == 0
        ? 1
        : Math.ceil(this.calendar.CurrentDay / limit);

// TODO: might put week back - 24/1/22
    const query = `/calendar/${this.yearString}/days?paginate=true&populate=true&limit=${limit}&week=${week}&not_played=true`;
    this.$axios
      .get(query)
      .then(response => {
        this.days = response.data.payload;
      })
      .catch(error => {
        console.log('Error getting days of Calendar Year!', error);
      });
  }

  private selectDay(val: number) {
    this.selectedDayIndex = val;
  }

  mounted() {
    this.$nextTick(function() {
      if (this.lobby) {
        this.$router.push('/u/lobby');
      }
    });
  }
}
</script>

<style></style>
