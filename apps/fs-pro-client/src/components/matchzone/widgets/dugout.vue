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
        <div class="pa-3">
          <h4 class="dugout-section-title mb-2">Live Tactical Shift</h4>
          <p class="text-caption text-medium-emphasis mb-2">
            Order in-match tactical adjustments from the dugout:
          </p>

          <v-btn-toggle
            v-model="activePlayingStyle"
            mandatory
            density="compact"
            color="primary"
            class="mb-3 d-flex flex-wrap"
          >
            <v-btn value="Balanced" size="small">Balanced</v-btn>
            <v-btn value="High Press" size="small">High Press</v-btn>
            <v-btn value="Low Block" size="small">Low Block</v-btn>
            <v-btn value="Possession" size="small">Possess</v-btn>
            <v-btn value="Direct" size="small">Direct</v-btn>
          </v-btn-toggle>

          <v-alert density="compact" type="info" variant="tonal" class="text-caption mb-3">
            Instruction: <strong>{{ activePlayingStyle }}</strong> active
          </v-alert>

          <h4 class="dugout-section-title mb-2">Bench Substitutions</h4>
          <v-list density="compact" class="pa-0">
            <v-list-item
              v-for="sub in benchSubs"
              :key="sub._id"
              class="px-1 mb-1 rounded bg-surface-variant"
            >
              <template #prepend>
                <v-chip size="x-small" color="primary" class="mr-2">{{ sub.Position }}</v-chip>
              </template>
              <v-list-item-title class="text-caption font-weight-medium">
                {{ sub.FirstName }} {{ sub.LastName }}
              </v-list-item-title>
              <template #append>
                <v-btn
                  size="x-small"
                  variant="flat"
                  color="warning"
                  :disabled="matchFinished"
                  @click="makeSub(sub)"
                >
                  Sub On
                </v-btn>
              </template>
            </v-list-item>

            <div v-if="benchSubs.length === 0" class="text-caption text-medium-emphasis py-2 text-center">
              No substitutes available on bench.
            </div>
          </v-list>
        </div>
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
import { ref, computed, watch } from 'vue';
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

const props = withDefaults(defineProps<Props>(), {
  matchFinished: false,
});

const emit = defineEmits<{
  'match-selected': [match: any];
  'tactic-changed': [style: string];
  'sub-requested': [player: any];
}>();

defineOptions({
  name: 'DugoutWidget',
});

const tab = ref<number>(props.matchFinished ? 3 : 0);
const activePlayingStyle = ref('Balanced');

watch(
  () => props.matchFinished,
  (isFinished) => {
    if (isFinished) {
      tab.value = 3;
    }
  }
);

const benchSubs = computed(() => {
  const squad = props.homeSquad || props.home?.Players || [];
  return squad.filter((p: any) => p.Substitute || p.isSubstituted || p.PositionNumber > 11).slice(0, 7);
});

function makeSub(sub: any) {
  emit('sub-requested', sub);
}

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
