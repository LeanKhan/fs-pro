<template>
  <div class="performance-zone">
    <v-card class="mb-4" :loading="loading">
      <v-card-title class="d-flex align-center flex-wrap gap-2">
        <v-icon color="amber">mdi-chart-line</v-icon>
        Performance Analysis
        <v-spacer />
        <v-select
          v-if="data && data.availableYears.length > 1"
          v-model="year"
          :items="data.availableYears"
          label="Season cycle"
          density="compact"
          variant="outlined"
          hide-details
          style="max-width: 200px"
        />
      </v-card-title>
      <v-card-subtitle v-if="data">
        {{ data.clubName }} · {{ data.year }} · {{ data.leagueCode }}
      </v-card-subtitle>
    </v-card>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>

    <template v-if="data">
      <!-- Headline numbers -->
      <v-row class="mb-2">
        <v-col cols="6" md="3">
          <v-card variant="tonal" class="pa-3 text-center">
            <div class="text-caption">Record</div>
            <div class="text-h6">
              {{ data.overall.won }}W {{ data.overall.drawn }}D {{ data.overall.lost }}L
            </div>
            <div class="d-flex justify-center gap-1 mt-1">
              <v-chip
                v-for="(r, i) in data.form"
                :key="i"
                size="x-small"
                :color="resultColor(r)"
                variant="flat"
              >
                {{ r }}
              </v-chip>
            </div>
          </v-card>
        </v-col>
        <v-col cols="6" md="3">
          <v-card variant="tonal" class="pa-3 text-center">
            <div class="text-caption">Points / expected</div>
            <div class="text-h6">
              {{ data.overall.points }}
              <span class="text-medium-emphasis">/ {{ data.overall.expectedPoints }}</span>
            </div>
            <div class="text-caption" :class="luckClass">{{ luckText }}</div>
          </v-card>
        </v-col>
        <v-col cols="6" md="3">
          <v-card variant="tonal" class="pa-3 text-center">
            <div class="text-caption">Goals for - against</div>
            <div class="text-h6">{{ data.overall.goalsFor }} - {{ data.overall.goalsAgainst }}</div>
            <div class="text-caption text-medium-emphasis">
              {{ perGame(data.overall.goalsFor, data.overall.played) }} scored ·
              {{ perGame(data.overall.goalsAgainst, data.overall.played) }} conceded per game
            </div>
          </v-card>
        </v-col>
        <v-col cols="6" md="3">
          <v-card variant="tonal" class="pa-3 text-center">
            <div class="text-caption">League average</div>
            <div class="text-h6">{{ data.leagueGoalsPerGame.scored }}</div>
            <div class="text-caption text-medium-emphasis">goals per team per game</div>
          </v-card>
        </v-col>
      </v-row>

      <!-- Findings -->
      <v-card class="mb-4">
        <v-card-title>What's going on</v-card-title>
        <v-list density="comfortable" class="bg-transparent">
          <v-list-item v-for="(insight, i) in data.insights" :key="i">
            <template #prepend>
              <v-icon :color="severity[insight.severity].color" class="mr-3">
                {{ severity[insight.severity].icon }}
              </v-icon>
            </template>
            <v-list-item-title class="font-weight-bold text-wrap">
              {{ insight.title }}
            </v-list-item-title>
            <v-list-item-subtitle class="text-wrap">{{ insight.detail }}</v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </v-card>

      <v-row>
        <!-- Splits -->
        <v-col cols="12" md="7">
          <v-card class="mb-4">
            <v-card-title>Results breakdown</v-card-title>
            <v-table density="compact">
              <thead>
                <tr>
                  <th />
                  <th class="text-right">P</th>
                  <th class="text-right">W</th>
                  <th class="text-right">D</th>
                  <th class="text-right">L</th>
                  <th class="text-right">GF</th>
                  <th class="text-right">GA</th>
                  <th class="text-right">Pts</th>
                  <th class="text-right">xPts</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in splits" :key="row.label">
                  <td>{{ row.label }}</td>
                  <td class="text-right">{{ row.r.played }}</td>
                  <td class="text-right">{{ row.r.won }}</td>
                  <td class="text-right">{{ row.r.drawn }}</td>
                  <td class="text-right">{{ row.r.lost }}</td>
                  <td class="text-right">{{ row.r.goalsFor }}</td>
                  <td class="text-right">{{ row.r.goalsAgainst }}</td>
                  <td class="text-right font-weight-bold">{{ row.r.points }}</td>
                  <td class="text-right text-medium-emphasis">{{ row.r.expectedPoints }}</td>
                </tr>
              </tbody>
            </v-table>
            <v-card-text class="text-caption text-medium-emphasis">
              xPts is what the match model expects from these games given both squads'
              current lineups - a big gap to Pts points to luck rather than quality.
            </v-card-text>
          </v-card>
        </v-col>

        <!-- Strength -->
        <v-col cols="12" md="5">
          <v-card class="mb-4">
            <v-card-title>Strength vs the league</v-card-title>
            <v-list density="compact" class="bg-transparent">
              <v-list-item v-for="u in data.units" :key="u.unit">
                <v-list-item-title>
                  {{ u.unit }}
                  <span class="text-medium-emphasis">
                    {{ u.rating }} (avg {{ u.leagueAverage }})
                  </span>
                </v-list-item-title>
                <v-progress-linear
                  :model-value="rankPercent(u)"
                  :color="rankColor(u)"
                  height="8"
                  rounded
                  class="mt-1"
                />
                <div class="text-caption text-medium-emphasis">{{ u.rank }} of {{ u.of }}</div>
              </v-list-item>
            </v-list>
            <v-card-text class="text-caption">
              Starters avg {{ data.squad.startingAverage }} · bench avg
              {{ data.squad.benchAverage }} · age {{ data.squad.averageAge }} · squad
              {{ data.squad.size }}
              <template v-if="data.squad.formation">
                · {{ data.squad.formation }} {{ data.squad.style }}
              </template>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <!-- Match log -->
      <v-card class="mb-4">
        <v-card-title>Match by match</v-card-title>
        <v-table density="compact">
          <thead>
            <tr>
              <th>Day</th>
              <th>Comp</th>
              <th>Opponent</th>
              <th class="text-center">Score</th>
              <th class="text-right">xG</th>
              <th class="text-right">Pts vs xPts</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in [...data.matches].reverse()" :key="m.fixtureId">
              <td>{{ m.day }}</td>
              <td>{{ m.competition }}</td>
              <td>
                {{ m.venue === 'home' ? 'vs' : '@' }} {{ m.opponent }}
                <span class="text-medium-emphasis">({{ Math.round(m.opponentRating) }})</span>
              </td>
              <td class="text-center">
                <v-chip size="x-small" :color="resultColor(m.result)" variant="flat">
                  {{ m.goalsFor }}-{{ m.goalsAgainst }}
                </v-chip>
              </td>
              <td class="text-right text-medium-emphasis">
                {{ m.expectedGoalsFor }}-{{ m.expectedGoalsAgainst }}
              </td>
              <td class="text-right" :class="pointsClass(m)">
                {{ pointsFor(m) }} / {{ m.expectedPoints }}
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card>

      <v-row>
        <v-col cols="12" md="6">
          <v-card>
            <v-card-title>Best performers</v-card-title>
            <v-list v-if="data.topPlayers.length" density="compact" class="bg-transparent">
              <v-list-item v-for="p in data.topPlayers" :key="p.playerId">
                <v-list-item-title>{{ p.name }}</v-list-item-title>
                <v-list-item-subtitle>
                  {{ p.position }} · {{ p.appearances }} apps · {{ p.goals }}G {{ p.assists }}A
                </v-list-item-subtitle>
                <template #append>
                  <v-chip size="small" color="success" variant="tonal">{{ p.averagePoints }}</v-chip>
                </template>
              </v-list-item>
            </v-list>
            <v-card-text v-else class="text-medium-emphasis">Not enough appearances yet.</v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" md="6">
          <v-card>
            <v-card-title>Weakest starters</v-card-title>
            <v-list density="compact" class="bg-transparent">
              <v-list-item v-for="p in data.weakestStarters" :key="p.playerId">
                <v-list-item-title>{{ p.name }}</v-list-item-title>
                <v-list-item-subtitle>{{ p.position }} · age {{ p.age }}</v-list-item-subtitle>
                <template #append>
                  <v-chip size="small" color="warning" variant="tonal">{{ p.rating }}</v-chip>
                </template>
              </v-list-item>
            </v-list>
          </v-card>
        </v-col>
      </v-row>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { client } from '@/services/api';
import type { ClubPerformance } from '@repo/api-contract';

const props = defineProps<{ club: any }>();

type Match = ClubPerformance['matches'][number];
type Unit = ClubPerformance['units'][number];

const loading = ref(false);
const error = ref('');
const data = ref<ClubPerformance | null>(null);
const year = ref<string | undefined>(undefined);

const severity = {
  problem: { icon: 'mdi-alert-octagon', color: 'error' },
  warning: { icon: 'mdi-alert', color: 'warning' },
  info: { icon: 'mdi-information', color: 'info' },
  good: { icon: 'mdi-check-circle', color: 'success' },
} as const;

const splits = computed(() =>
  data.value
    ? [
        { label: 'Overall', r: data.value.overall },
        { label: 'Home', r: data.value.home },
        { label: 'Away', r: data.value.away },
        { label: 'Vs stronger clubs', r: data.value.vsStronger },
        { label: 'Vs weaker clubs', r: data.value.vsWeaker },
      ]
    : []
);

const luck = computed(() => {
  if (!data.value || data.value.overall.played < 6) return 0;
  return data.value.overall.points - data.value.overall.expectedPoints;
});
const luckText = computed(() =>
  luck.value <= -4 ? 'unlucky so far' : luck.value >= 4 ? 'overperforming' : 'about as expected'
);
const luckClass = computed(() =>
  luck.value <= -4 ? 'text-info' : luck.value >= 4 ? 'text-warning' : 'text-medium-emphasis'
);

const perGame = (n: number, played: number) => (played ? (n / played).toFixed(2) : '0.00');
const resultColor = (r: string) => (r === 'W' ? 'success' : r === 'D' ? 'grey' : 'error');
const pointsFor = (m: Match) => (m.result === 'W' ? 3 : m.result === 'D' ? 1 : 0);
const pointsClass = (m: Match) => {
  const gap = pointsFor(m) - m.expectedPoints;
  return gap >= 1 ? 'text-success' : gap <= -1 ? 'text-error' : 'text-medium-emphasis';
};

/** Bar length: full bar = best in the league, empty = worst. */
const rankPercent = (u: Unit) => (u.of <= 1 ? 100 : ((u.of - u.rank) / (u.of - 1)) * 100);
const rankColor = (u: Unit) =>
  u.rank <= Math.ceil(u.of / 3) ? 'success' : u.rank > Math.ceil((u.of * 2) / 3) ? 'error' : 'warning';

async function load() {
  if (!props.club?._id) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await client.clubs.getClubPerformance.query({
      params: { id: props.club._id },
      query: { year: year.value },
    });
    if (res.status === 200) {
      data.value = res.body.payload;
      if (!year.value) year.value = res.body.payload.year;
    } else {
      error.value = res.body.message;
    }
  } catch (err) {
    console.error('Error loading club performance:', err);
    error.value = 'Could not load the performance analysis';
  } finally {
    loading.value = false;
  }
}

watch(year, (value, previous) => {
  if (previous !== undefined && value !== data.value?.year) load();
});
watch(() => props.club?._id, () => {
  year.value = undefined;
  load();
});
onMounted(load);
</script>
