<template>
  <v-card
    class="mx-2 pa-1"
    :input-value="active"
    active-class="indigo white--text"
    depressed
    rounded
    height="180px"
    width="200px"
    :color="active ? 'indigo' : 'indigo lighten-2'"
    @click="toggle"
  >
    <v-card-text class="pa-0">
      <span v-if="$route.name == 'Club Home'">Your match? {{ isClub }}</span>
      <v-row no-gutters>
        <template v-if="!day.isFree">
          <template v-if="!singleLeague">
            <v-col cols="12">
              <day-match v-if="leagueMatch" :match="leagueMatch" :home="true"></day-match>
              <v-btn
                dark
                icon
              >
                <v-icon>mdi-caret-down</v-icon>
              </v-btn>
            </v-col>
          </template>

          <!-- If not in singleLeague -->
          <template v-else>
            <div v-if="isClub">
              <v-icon large>
                ${{ day.Matches[0] ? day.Matches[0].Fixture.Home : 'NA' }}
              </v-icon>

              <span>vs</span>

              <v-icon large>
                ${{ day.Matches[0] ? day.Matches[0].Fixture.Away : 'NA' }}
              </v-icon>
            </div>

            <div v-else>
              Not your match!
            </div>
          </template>
        </template>

        <!-- No match :p -->
        <template v-else>
          <p>no match!</p>
        </template>
      </v-row>
    </v-card-text>

    <v-divider></v-divider>
    <v-card-actions class="text-center">
      <v-chip small :color="active ? 'indigo darken-2' : 'indigo'">
        Day {{ day.Day }}
      </v-chip>
      <v-spacer></v-spacer>

    <v-dialog
      v-model="dialog"
      scrollable
      max-width="400px"
    >
      <template v-slot:activator="{ on, attrs }">
        <v-btn
                dark
                icon
                v-bind="attrs"
                v-on="on"
              >
                <v-icon>mdi-dots-vertical</v-icon>
              </v-btn>
      </template>
      <v-card>
        <v-card-title>Other Matches Today</v-card-title>
        <v-divider></v-divider>
        <v-card-text style="height: 300px;">
          <v-list dense>
            <v-list-item v-for="(m, i) in day.Matches" :key="i">
              <v-list-item-content>
                <v-list-item-title>
                  {{ m.Fixture.Title }}
                </v-list-item-title>
              </v-list-item-content>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </v-dialog>
    </v-card-actions>
  </v-card>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { IDay } from '../../interfaces/calendar';
import DayMatch from './day-match.vue';

@Component({
  components: { DayMatch },
})
export default class CalendarDay extends Vue {
  @Prop({ required: true }) readonly day!: IDay;
  @Prop({ required: true }) readonly toggle!: any;
  @Prop({ required: true }) readonly active!: any;
  @Prop({ required: true }) readonly singleLeague!: boolean;
  @Prop() readonly club!: string;

  private dialog = false;

  get $selectedLeague() {
    return this.$store.getters.selectedLeague;
  }

  get leagueMatch() {
  // this is just the first Match of the League matches that day. It should
  // actually be the selected match!
  if (this.$selectedLeague){
    return this.day.Matches.find(m => m.CompetitionId == this.$selectedLeague)
  }
  }

  get isClub(): boolean {
    if (this.club) {
      return (
        this.leagueMatch.Fixture.Home == this.club ||
        this.leagueMatch.Fixture.Away == this.club
      );
    }

    return false;
  }
}
</script>

<style></style>
