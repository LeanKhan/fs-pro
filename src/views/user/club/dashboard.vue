<template>
  <div>
    <v-card>
      <v-toolbar>
        <!-- Current day -->
        <v-toolbar-title>
          <template v-if="club && season">
            <v-icon x-large>${{ club.ClubCode }}</v-icon>
            <v-chip small class="ml-1 subtitle-1 font-weight-bold white--text">
              {{ club.League.Name }}
            </v-chip>
          </template>
        </v-toolbar-title>

        <!-- TODO: Add backer button, make tabs routable, fix the router function after firing manager -->

        <v-spacer></v-spacer>
        <template v-if="club">
          <v-icon x-large>${{ club.ClubCode }}</v-icon>
          <span class="subtitle-1 font-weight-bold white--text">
            {{ club.Name }}
          </span>
        </template>
      </v-toolbar>

      <!-- Main -->
      <!-- TABS! -->
      <v-tabs fixed-tabs v-model="tab">
        <v-tab>
          Home
        </v-tab>

        <v-tab>
          Squad Zone
        </v-tab>

        <v-tab>
          Club Zone
        </v-tab>

        <v-tab>
          Transfer Zone
        </v-tab>
      </v-tabs>
    </v-card>

    <v-tabs-items
      background-color="transparent"
      color="transparent"
      v-model="tab"
    >
      <v-tab-item>
        <v-row>
          <v-col cols="8">
            <!-- Current Fixture -->
            <v-card v-if="selectedDay" color="primary">
              <template v-if="!selectedDay.isFree">
                <v-card
                  color="transparent"
                  min-height="180px"
                  class="text-center"
                  flat
                  tile
                >
                  <v-card-text>
                    <v-row>
                      <v-col cols="9">
                        <span>HOME</span>
                        <v-avatar tile size="70px">
                          <v-icon style="font-size: 70px; height: 70px" x-large>
                            ${{
                              selectedDay.Matches[competitionIndex].Fixture.Home
                            }}
                          </v-icon>
                        </v-avatar>

                        vs

                        <v-avatar tile size="70px">
                          <v-icon style="font-size: 70px; height: 70px" x-large>
                            ${{
                              selectedDay.Matches[competitionIndex].Fixture.Away
                            }}
                          </v-icon>
                        </v-avatar>
                        <span>AWAY</span>

                        <div class="pa-0 text-center">
                          <p class="mb-2 caption white--text">
                            {{
                              selectedDay.Matches[competitionIndex].Fixture
                                .Title
                            }}
                          </p>

                          <p class="mb-0 caption">
                            {{
                              selectedDay.Matches[competitionIndex].Fixture
                                .Stadium
                            }}
                          </p>
                        </div>
                      </v-col>

                      <v-col cols="3">
                        <v-card-subtitle>
                          {{
                            selectedDay.Matches[competitionIndex].Competition
                          }}
                          <v-icon large color="amber lighten-3">
                            mdi-trophy
                          </v-icon>
                        </v-card-subtitle>

                        <template v-if="season && season.isStarted">
                          <v-btn
                            :disabled="
                              selectedDay.Matches[competitionIndex].Fixture
                                .Played
                            "
                            :to="
                              '/matchzone/' +
                                selectedDay.Matches[
                                  competitionIndex
                                ].Fixture._id.toString()
                            "
                          >
                            Play
                          </v-btn>
                        </template>
                      </v-col>
                    </v-row>
                  </v-card-text>
                </v-card>
              </template>

              <template v-else>
                <v-card color="grey" height="190px">
                  <v-card-text>
                    No matches today
                    <v-icon color="green">mdi-football</v-icon>
                  </v-card-text>
                </v-card>
              </template>

              <!-- Fixtures scroller -->
              <v-divider class="mx-2"></v-divider>
              <v-sheet width="100%" color="transparent" tile class="mt-5 pb-3">
                <!-- <v-subheader>Upcoming Fixtures</v-subheader> -->
                <day-scroll
                  :days="clubDays"
                  :singleLeague="true"
                  :club="club.ClubCode"
                  @selected-day-index-changed="selectDay"
                ></day-scroll>
              </v-sheet>
            </v-card>

            <!-- Standings and other stuff -->

            <!-- Standings and other stuff -->
            <v-card color="deep-purple" class="mt-3">
              <template v-if="season">
                <v-card-title>
                  {{ season.CompetitionCode }}
                </v-card-title>

                <v-card-text>
                  <standings-scroller
                    :standings="season.Standings"
                  ></standings-scroller>
                </v-card-text>
              </template>
              <template v-else>
                <span>No season yet :/</span>
              </template>
            </v-card>
          </v-col>
          <v-col cols="4">
            <v-card>
              <v-sheet height="400px" width="100%" color="green darken-2">
                Yeet beat
              </v-sheet>
            </v-card>
          </v-col>
        </v-row>
      </v-tab-item>
      <v-tab-item>
        <squad-zone :club="club"></squad-zone>
      </v-tab-item>
      <v-tab-item>
        <club-zone :club="club" @update-available="refresh"></club-zone>
      </v-tab-item>
      <v-tab-item>
        <transfer-zone></transfer-zone>
      </v-tab-item>
    </v-tabs-items>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Route, RawLocation } from 'vue-router';
// Zone Components
import { ClubZone, SquadZone, TransferZone } from './zones';
// Other UI components
import DayScroll from '@/components/calendar/day-scroll.vue';
import StandingsScroller from '@/components/seasons/standings-scroller.vue';
import { ICalendar, IDay } from '@/interfaces/calendar';
// import { IFixture } from '@/interfaces/fixture';
@Component({
  components: {
    ClubZone,
    SquadZone,
    TransferZone,
    DayScroll,
    StandingsScroller,
  },
  beforeRouteUpdate(
    to: Route,
    from: Route,
    next: (to?: RawLocation | false | ((vm: ClubHome) => any) | void) => void
  ): void {
    const clubId = to.params['id'];

    this.fetchClub(clubId);
    next();
  },
})
export default class ClubHome extends Vue {
  private club: any = {};

  private selectedDayIndex = 0;

  private tab: any = null;

  private seasonTab = null;

  private days: IDay[] = [];

  private season: any = {};

  private limit = 14;

  /** Club calendar */
  get calendar(): ICalendar {
    return this.$store.state.calendar;
  }

  get yearString(): string {
    return this.$store.state.calendar.YearString;
  }
  // get seasons() {
  //   return this.$store.state.seasons;
  // }

  get clubDays() {
    return this.days.map(day => {
      const Matches = day.Matches.filter(match => {
        return match.Fixture.LeagueCode == this.club.LeagueCode;
      });

      return { ...day, Matches };
    });
  }

  /** Club Season
  get season() {
    // find the season the club belongs to
    // use an API call!

    return this.seasons.find(
      (s: any) => s.CompetitionCode == this.club.LeagueCode
    );
  } 

  */

  get competitionIndex() {
    // TODO: fetch the competition gan!
    let index = 0;
    switch (this.club.LeagueCode) {
      case 'EFL':
        index = 0;
        break;
      case 'EBSL':
        index = 1;
        break;
    }

    return index;
  }

  get selectedDay() {
    if (this.days) {
      return this.days[this.selectedDayIndex];
    }

    return { isFree: false } as IDay;
  }

  /** Calendar day */

  get isClub(): boolean {
    if (this.club) {
      return (
        this.selectedDay.Matches[this.competitionIndex].Fixture.Home ==
          this.club ||
        this.selectedDay.Matches[this.competitionIndex].Fixture.Away ==
          this.club
      );
    }

    return false;
  }

  /* === Methods ===  */

  private selectDay(val: number) {
    this.selectedDayIndex = val;
  }

  private fetchCurrentSeason() {
    if(this.calendar && this.calendar.YearString){
      this.$axios
      .get(`/seasons?query=${JSON.stringify({Year: this.calendar.YearString, Competition: this.club.League})}`)
      .then(response => {
        // Check for errors here o
        if (response.data.success) {
          this.season = response.data.payload[0];
        }
      })
      .catch(response => {
        console.log('Error fetching club current Season! => ', response);
      });
    }
  }

  private fetchClub(clubId: string): void {
    const populate = [
      { path: 'Players', select: 'FirstName LastName Fullname Rating Position Nationality RatingsHistory Age' },
      { path: 'Manager' },
      { path: 'League', select: '-Clubs -Seasons' },
    ];
    this.$axios
      .get(`/clubs/${clubId}?populate=${JSON.stringify(populate)}`)
      .then(response => {
        // Check for errors here o
        if (response.data.success) {
          this.club = response.data.payload;
        }
      })
      .catch(response => {
        console.log('Error fetching club! => ', response);
      });
  }

  private getDays() {
    // const week =
    //   this.calendar.CurrentDay == 0
    //     ? 1
    //     : Math.ceil((this.calendar.CurrentDay as number) / this.limit);

        const query = `/calendar/${this.yearString}/days?paginate=true&populate=true&limit=${this.limit}&not_played=true`;

    this.$axios
      .get(query)
      .then(response => {
        this.days = response.data.payload;
      })
      .catch(error => {
        console.log('Error getting Days of Calendar Year!', error);
      });
  }

  private refresh() {
    this.fetchClub(this.club._id);
  }

  private newGame() {
    // send that event and wait for the result...
    // if success then go to match zone and send 'join-match' event...
    // or maybe we should just go to matchzone straight? and wait for the match...
  }

  private mounted(): void {
    const clubId = this.$route.params['id'];

    this.getDays();
    this.fetchClub(clubId);
    this.fetchCurrentSeason();
  }

  //   private beforeRouteEnter(to: any, from: any, next: any): void {
  //     console.log('To From', to, from);
  //     next();
  //   }
}
</script>

<style></style>
