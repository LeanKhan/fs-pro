<template>
  <v-card flat>
    <v-window v-model="onboarding" reverse>
      <v-window-item v-for="(standing, i) in standings" :key="`standing-${i}`">
        <standings :WeekStandings="standing"></standings>
      </v-window-item>
    </v-window>

    <v-card-actions class="justify-space-between">
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
@Component({
  name: 'StandingsScroller',
  components: {
    // Week Table
    Standings,
  },
})
export default class StandingsScroller extends Vue {
  @Prop({ required: true }) standings!: any[];

  private length = this.standings.length;
  private onboarding = 0;

  private next() {
    this.onboarding =
      this.onboarding + 1 === this.length ? 0 : this.onboarding + 1;
  }

  private prev() {
    this.onboarding =
      this.onboarding - 1 < 0 ? this.length - 1 : this.onboarding - 1;
  }
}
</script>
