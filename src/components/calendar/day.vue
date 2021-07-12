<template>
  <v-card
    class="mx-2 pa-1"
    :input-value="active"
    active-class="indigo white--text"
    depressed
    rounded
    width="200px"
    :color="active ? 'indigo' : 'indigo lighten-2'"
    @click="toggle"
  >
    <v-card-text class="pa-0">
      <v-row no-gutters>
        <template v-if="!day.isFree">
          <template v-if="!singleLeague">
            <v-col cols="12">
              <day-match :match="day.Matches[0]" :home="true"></day-match>
            </v-col>
            <v-col cols="12">
              <day-match :match="day.Matches[1]" :home="false"></day-match>
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

  get isClub(): boolean {
    if (this.club) {
      return (
        this.day.Matches[0].Fixture.Home == this.club ||
        this.day.Matches[0].Fixture.Away == this.club
      );
    }

    return false;
  }
}
</script>

<style></style>
