<template>
  <div class="world-feed-ticker">
    <v-card class="pa-4 bg-surface elevation-3 mb-4 rounded-lg">
      <div class="d-flex justify-space-between align-center mb-3">
        <div class="d-flex align-center gap-2">
          <v-icon color="amber" size="large">mdi-newspaper-variant-outline</v-icon>
          <span class="text-h6 font-weight-bold">
            The Living World: What Happened in the Meantime
          </span>
        </div>
        <v-btn
          size="small"
          variant="text"
          prepend-icon="mdi-refresh"
          :loading="loading"
          @click="fetchFeed"
        >
          Refresh Feed
        </v-btn>
      </div>

      <!-- Headline News Carousel / Cards -->
      <v-row>
        <v-col
          v-for="hl in headlines"
          :key="hl.id"
          cols="12"
          md="6"
        >
          <v-card variant="outlined" class="pa-3 news-card h-100 d-flex flex-column justify-space-between">
            <div>
              <div class="d-flex justify-space-between align-center mb-1">
                <v-chip
                  size="x-small"
                  :color="getCategoryColor(hl.category)"
                  class="font-weight-bold"
                >
                  {{ hl.tag || hl.category.toUpperCase() }}
                </v-chip>
                <span class="text-caption text-medium-emphasis">{{ hl.timestamp }}</span>
              </div>

              <div class="text-subtitle-2 font-weight-bold mt-1 text-white">
                {{ hl.title }}
              </div>

              <p class="text-caption text-medium-emphasis mt-1 mb-2">
                {{ hl.summary }}
              </p>
            </div>

            <div v-if="hl.relatedFixtureId" class="mt-2 text-right">
              <v-btn
                size="x-small"
                variant="tonal"
                color="info"
                prepend-icon="mdi-play"
                :to="'/matchzone/' + hl.relatedFixtureId"
              >
                Watch Match Replay
              </v-btn>
            </div>
          </v-card>
        </v-col>

        <v-col v-if="headlines.length === 0 && !loading" cols="12">
          <div class="text-caption text-medium-emphasis text-center py-4">
            No breaking headlines recorded yet today. Matches and transfers in progress...
          </div>
        </v-col>
      </v-row>

      <!-- Multi-League Leaders & World Bulletin Sub-row -->
      <v-row class="mt-2">
        <!-- Other Leagues Summary -->
        <v-col cols="12" md="7">
          <div class="text-subtitle-2 font-weight-bold mb-2 d-flex align-center">
            <v-icon size="small" color="amber" class="mr-1">mdi-trophy-variant</v-icon>
            Divisions Across The World
          </div>

          <div class="d-flex gap-2 flex-wrap">
            <v-card
              v-for="lg in otherLeagues"
              :key="lg.id"
              variant="tonal"
              class="pa-2 league-pill"
            >
              <div class="text-caption font-weight-bold">{{ lg.name }}</div>
              <div class="text-caption text-medium-emphasis">
                1st: <strong class="text-white">{{ lg.leader }}</strong> ({{ lg.leaderPoints }} pts)
              </div>
            </v-card>

            <div v-if="otherLeagues.length === 0" class="text-caption text-medium-emphasis">
              No other leagues active.
            </div>
          </div>
        </v-col>

        <!-- World Medical Bulletin -->
        <v-col cols="12" md="5">
          <div class="text-subtitle-2 font-weight-bold mb-2 d-flex align-center">
            <v-icon size="small" color="error" class="mr-1">mdi-medical-bag</v-icon>
            Global Injury Bulletin
          </div>

          <div class="d-flex gap-1 flex-wrap">
            <v-chip
              v-for="inj in activeInjuries.slice(0, 5)"
              :key="inj.playerId"
              size="x-small"
              color="error"
              variant="tonal"
              class="mb-1"
            >
              {{ inj.name }} ({{ inj.club }}): {{ inj.type }} ({{ inj.daysRemaining }}d)
            </v-chip>

            <div v-if="activeInjuries.length === 0" class="text-caption text-medium-emphasis">
              Clean bill of health reported across monitored squads.
            </div>
          </div>
        </v-col>
      </v-row>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { client } from '@/services/api';
import type {
  WorldFeedHeadline,
  WorldFeedOtherLeague,
  WorldFeedInjury,
} from '@repo/api-contract';

const headlines = ref<WorldFeedHeadline[]>([]);
const otherLeagues = ref<WorldFeedOtherLeague[]>([]);
const activeInjuries = ref<WorldFeedInjury[]>([]);
const loading = ref(false);

function getCategoryColor(cat: string): string {
  switch (cat) {
    case 'result':
      return 'primary';
    case 'transfer':
      return 'success';
    case 'injury':
      return 'error';
    case 'manager':
      return 'warning';
    case 'milestone':
      return 'purple';
    default:
      return 'info';
  }
}

async function fetchFeed() {
  loading.value = true;
  try {
    const res = await client.calendar.getWorldFeed.query({});
    if (res.status === 200) {
      headlines.value = res.body.payload.headlines || [];
      otherLeagues.value = res.body.payload.otherLeagues || [];
      activeInjuries.value = res.body.payload.activeInjuries || [];
    }
  } catch (err) {
    console.error('Error fetching world feed:', err);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchFeed();
});
</script>

<style scoped>
.world-feed-ticker {
  width: 100%;
}
.news-card {
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  transition: transform 0.2s, background 0.2s;
}
.news-card:hover {
  background: rgba(255, 255, 255, 0.06);
  transform: translateY(-2px);
}
.league-pill {
  min-width: 130px;
  border-radius: 6px;
}
</style>
