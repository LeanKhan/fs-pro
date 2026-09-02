<template>
  <div>
    <v-tabs fixed-tabs :model-value="tab" @update:model-value="tab = $event">
      <v-tab>Squad</v-tab>

      <v-tab>Setup</v-tab>

      <v-tab>Today</v-tab>

      <v-tab>Results</v-tab>
    </v-tabs>
    <v-window :model-value="tab" @update:model-value="tab = $event">
      <v-window-item>
        <div class="px-0 py-2">
          <dugout-club
            :matchFinished="matchFinished"
            :club="home"
            :clubSquad="homeSquad"
            :isHome="true"
          ></dugout-club>

          <v-divider></v-divider>
          <!-- Away Squad -->
          <dugout-club
            :matchFinished="matchFinished"
            :club="away"
            :clubSquad="awaySquad"
            :isHome="false"
          ></dugout-club>
        </div>
      </v-window-item>
      <v-window-item>
        <v-card-text>Coming soon...</v-card-text>
      </v-window-item>

      <v-window-item>
        <v-card-text>
          <day-fixtures-list
            :Matches="dayFixtures || []"
            Detail="results"
            :MandatorySelect="false"
            @match-selected="matchSelected"
          ></day-fixtures-list>
        </v-card-text>
      </v-window-item>

      <v-window-item>
        <v-card-text>
          <h4 class="dugout-section-title">Results</h4>
          <p v-if="!matchFinished" class="dugout-empty">No data yet...</p>
          <results
            v-else
            :home="match.Home"
            :away="match.Away"
            :matchDetails="{
              Home: match.HomeSideDetails,
              Away: match.AwaySideDetails,
            }"
          ></results>

          <h4 class="dugout-section-title mt-4">MOTM</h4>
          <p v-if="!matchFinished" class="dugout-empty">No data</p>
          <motm v-else :motm_id="match.Details?.MOTM"></motm>

          <h4 class="dugout-section-title mt-4">Timeline</h4>
          <p v-if="!matchFinished && !liveEvents?.length" class="dugout-empty">
            No events yet
          </p>
          <timeline
            v-else
            :Events="matchFinished ? match.Events : liveEvents"
          ></timeline>
        </v-card-text>
      </v-window-item>
    </v-window>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import DugoutClub from './dugout-club.vue';
import DayFixturesList from '@/components/user-dashboard/day-fixtures-list.vue';
import Results from './results.vue';
import Timeline from './timeline.vue';
import Motm from './motm.vue';

interface Props {
  home: any;
  away: any;
  homeSquad?: any;
  awaySquad?: any;
  match?: any;
  matchFinished?: any;
  dayFixtures?: any[];
  currentFixture: any;
  liveEvents?: any[];
}

withDefaults(defineProps<Props>(), {
  matchFinished: false,
});

const emit = defineEmits<{
  'match-selected': [match: any];
}>();

defineOptions({
  name: 'DugoutWidget',
});

const tab = ref<any>(null);

const matchSelected = (match: any) => {
  console.log('Selected match => ', match);
  // change selectedLeague
  emit('match-selected', match);
};
</script>

<style scoped>
.dugout-section-title {
  margin: 0 0 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.6;
}
.dugout-empty {
  opacity: 0.5;
  font-size: 13px;
}
</style>
