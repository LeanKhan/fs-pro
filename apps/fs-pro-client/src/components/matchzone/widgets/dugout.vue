<template>
  <div>
    <v-tabs fixed-tabs :model-value="tab" @update:model-value="tab = $event">
      <v-tab>Squad</v-tab>

      <v-tab>Setup</v-tab>

      <v-tab>Today</v-tab>
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
            :Matches="currentDay.Matches"
            Detail="results"
            :MandatorySelect="false"
            @match-selected="matchSelected"
          ></day-fixtures-list>
        </v-card-text>
      </v-window-item>
    </v-window>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import DugoutClub from './dugout-club.vue';
import DayFixturesList from '@/components/user-dashboard/day-fixtures-list.vue';

interface Props {
  home: any;
  away: any;
  homeSquad?: any;
  awaySquad?: any;
  match?: any;
  matchFinished?: any;
  currentDay?: any;
  currentFixture: any;
}

const props = withDefaults(defineProps<Props>(), {
  matchFinished: false,
});

const emit = defineEmits<{
  'match-selected': [match: any];
}>();

const tab = ref<any>(null);
const showHomeSquad = ref(false);
const showAwaySquad = ref(false);

const HomeSideDetails = computed(() => {
  if (props.match) return props.match.HomeSideDetails;
  else return false;
});

const AwaySideDetails = computed(() => {
  if (props.match) return props.match.AwaySideDetails;
  else return false;
});

const otherFixtures = computed(() => {
  if (props.currentDay) {
    return props.currentDay.Matches.map((f: any) => f.Fixture);
  }
});

const matchSelected = (match: any) => {
  console.log('Selected match => ', match);
  // change selectedLeague
  emit('match-selected', match);
};
</script>
