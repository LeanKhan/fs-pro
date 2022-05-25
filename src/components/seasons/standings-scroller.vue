<template>
  <v-card flat>
    <v-card-subtitle>
      <v-spacer></v-spacer>
      <v-switch
        v-model="showWeekly"
        dense
        hide-details
        label="Show Weekly Standings?"
      ></v-switch>
    </v-card-subtitle>
    <v-window v-if="showWeekly" v-model="onboarding" reverse>
      <v-window-item v-for="(standing, i) in standings" :key="`standing-${i}`">
        <standings :WeekStandings="standing" :compiled="showWeekly"></standings>
      </v-window-item>
    </v-window>

    <standings
      v-else
      :WeekStandings="compiledStandings"
      :compiled="showWeekly"
    ></standings>

    <v-card-actions v-if="showWeekly" class="justify-space-between">
      <v-btn text @click="prev">
        <v-icon>mdi-chevron-left</v-icon>
      </v-btn>
      <v-item-group v-model="onboarding" class="text-center" mandatory>
        <v-item
          v-for="n in length"
          :key="`btn-${n}`"
          v-slot:default="{ active, toggle }"
        >
          <!-- <v-avatar>
            {{ onboarding }}
        </v-avatar> -->
          <v-btn :input-value="active" icon @click="toggle">
            {{ n }}
          </v-btn>
        </v-item>
      </v-item-group>
      <v-btn text @click="next">
        <v-icon>mdi-chevron-right</v-icon>
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import Standings from '@/components/seasons/standings.vue';
import { WeekStandings } from '@/interfaces/season.ts';
@Component({
  name: 'StandingsScroller',
  components: {
    // Week Table
    Standings,
  },
})
export default class StandingsScroller extends Vue {
  @Prop({ required: true }) standings!: WeekStandings[];

//  public length = this.standings.length;
  public onboarding = 0;
  public showWeekly = false;

  private next() {
    this.onboarding =
      this.onboarding + 1 === this.length ? 0 : this.onboarding + 1;
  }

  private prev() {
    this.onboarding =
      this.onboarding - 1 < 0 ? this.length - 1 : this.onboarding - 1;
  }

  get length() {
  return this.standings.length;
  }

  get total() {
    return this.standings.reduce(
      (acc: any, week: WeekStandings) => acc.concat(week.Table),
      []
    );
  }

  get compiledStandings() {
    const sum: any[] = [];

    Array.from(new Set(this.total.map((x: any) => x.ClubCode))).forEach(x => {
      sum.push(
        this.total
          .filter((y: any) => y.ClubCode === x)
          .reduce((output: any, item: any) => {
            const pnts = output['Points'] === undefined ? 0 : output['Points'];
            const gd = output['GD'] === undefined ? 0 : output['GD'];
            const ga = output['GA'] === undefined ? 0 : output['GA'];
            const gf = output['GF'] === undefined ? 0 : output['GF'];
            const plyd = output['Played'] === undefined ? 0 : output['Played'];
            const w = output['Wins'] === undefined ? 0 : output['Wins'];
            const l = output['Losses'] === undefined ? 0 : output['Losses'];
            const d = output['Draws'] === undefined ? 0 : output['Draws'];

            output['ClubCode'] = x;
            output['Points'] = item.Points + pnts;
            output['GD'] = item.GD + gd;
            output['GA'] = item.GA + ga;
            output['GF'] = item.GF + gf;
            output['Played'] = item.Played + plyd;
            output['Wins'] = item.Wins + w;
            output['Losses'] = item.Losses + l;
            output['Draws'] = item.Draws + d;

            return output;
          }, {})
      );
    });
    return sum;
  }
}
</script>
