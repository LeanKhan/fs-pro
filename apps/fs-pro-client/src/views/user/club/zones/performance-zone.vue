<template>
  <div class="performance-zone">
    <performance-card :performance="board" class="mb-4" />
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

      <!-- Jev Tactical Advisor Card -->
      <v-card
        v-if="data.advisorSummary"
        class="mb-4 jev-advisor-card rounded-lg elevation-4 border overflow-hidden"
        :class="data.advisorSummary.crisisLevel === 'crisis' ? 'border-error' : 'border-amber'"
      >
        <div class="pa-4 bg-gradient-advisor">
          <div class="d-flex align-center justify-space-between flex-wrap gap-2 mb-2">
            <div class="d-flex align-center gap-2">
              <v-avatar size="32" color="deep-purple-accent-3">
                <v-icon size="20" color="white">mdi-brain</v-icon>
              </v-avatar>
              <div>
                <span class="text-subtitle-2 font-weight-black text-uppercase text-white tracking-wide">
                  JEV TACTICAL ADVISOR
                </span>
                <span class="text-caption text-medium-emphasis ml-2">
                  System One Decision Engine &bull; {{ data.advisorSummary.confidence }}% Confidence
                </span>
              </div>
            </div>

            <v-chip
              size="small"
              :color="crisisPillColor(data.advisorSummary.crisisLevel)"
              variant="flat"
              class="font-weight-bold"
            >
              {{ crisisPillLabel(data.advisorSummary.crisisLevel) }}
            </v-chip>
          </div>

          <div class="text-subtitle-1 font-weight-black text-amber-accent-2 mb-1">
            {{ data.advisorSummary.headline }}
          </div>
          <p class="text-caption text-white-50 mb-3">
            {{ data.advisorSummary.summary }}
          </p>

          <!-- Strategic Prescriptions Grid -->
          <v-row v-if="data.strategies?.length" dense>
            <v-col
              v-for="strat in data.strategies"
              :key="strat.id"
              cols="12"
              md="6"
            >
              <v-card
                variant="outlined"
                class="pa-3 h-100 strategy-subcard d-flex flex-column justify-space-between rounded"
                :class="'border-' + strategyColor(strat.severity)"
              >
                <div>
                  <div class="d-flex align-center justify-space-between mb-1">
                    <v-chip
                      size="x-small"
                      :color="strategyColor(strat.severity)"
                      variant="tonal"
                      class="font-weight-bold text-uppercase"
                    >
                      <v-icon size="12" class="mr-1">{{ pillarIcon(strat.pillar) }}</v-icon>
                      {{ strat.pillar }}
                    </v-chip>
                    <span class="text-caption font-weight-bold text-uppercase text-medium-emphasis">
                      {{ strat.severity }}
                    </span>
                  </div>

                  <div class="text-subtitle-2 font-weight-bold text-white mb-1">
                    {{ strat.title }}
                  </div>
                  <div class="text-caption text-medium-emphasis mb-2">
                    {{ strat.diagnosis }}
                  </div>
                  <p class="text-caption text-white-50 mb-3">
                    {{ strat.recommendation }}
                  </p>
                </div>

                <div v-if="strat.actionLabel" class="pt-2 border-t d-flex align-center justify-space-between flex-wrap gap-2">
                  <div v-if="strat.suggestedFormation || strat.suggestedStyle" class="text-caption font-weight-medium text-amber-lighten-2">
                    Suggested: {{ strat.suggestedFormation }} &bull; {{ strat.suggestedStyle }}
                  </div>
                  <v-btn
                    size="x-small"
                    variant="flat"
                    :color="strategyColor(strat.severity)"
                    class="font-weight-bold text-black ml-auto"
                    prepend-icon="mdi-arrow-right-circle"
                    @click="emitSwitchTab(strat.actionTab ?? 1)"
                  >
                    {{ strat.actionLabel }}
                  </v-btn>
                </div>
              </v-card>
            </v-col>
          </v-row>
        </div>
      </v-card>

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
import type { ClubPerformance, PerformanceView } from '@repo/api-contract';
import PerformanceCard from '@/components/open-play/performance-card.vue';
import { unwrap } from '@/store/open-play';

const props = defineProps<{ club: any }>();

// Board view: performance score across all competitions vs the Level target.
const board = ref<PerformanceView | null>(null);
async function loadBoard() {
  if (!props.club?._id) return;
  try {
    board.value = unwrap<PerformanceView>(
      await client.world.performance.query({ params: { clubId: String(props.club._id) }, query: {} })
    );
  } catch {
    board.value = null;
  }
}
watch(() => props.club?._id, loadBoard, { immediate: true });

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

const emit = defineEmits<{
  (e: 'switch-tab', tab: number): void;
}>();

function emitSwitchTab(tabIndex: number) {
  emit('switch-tab', tabIndex);
}

function crisisPillColor(level: string) {
  if (level === 'crisis') return 'red-accent-4';
  if (level === 'underperforming') return 'amber-accent-4';
  if (level === 'surging') return 'green-accent-4';
  return 'cyan-accent-3';
}

function crisisPillLabel(level: string) {
  if (level === 'crisis') return '🚨 CRISIS INTERVENTION';
  if (level === 'underperforming') return '⚠️ UNDERPERFORMING';
  if (level === 'surging') return '🔥 SURGING FORM';
  return '⚖️ BALANCED TRAJECTORY';
}

function strategyColor(sev: string) {
  if (sev === 'crisis') return 'red-accent-3';
  if (sev === 'warning') return 'amber-accent-3';
  if (sev === 'opportunity') return 'cyan-accent-3';
  return 'teal-accent-3';
}

function pillarIcon(pillar: string) {
  if (pillar === 'tactics') return 'mdi-strategy';
  if (pillar === 'selection') return 'mdi-account-switch';
  if (pillar === 'training') return 'mdi-dumbbell';
  return 'mdi-swap-horizontal-bold';
}
</script>

<style scoped>
.jev-advisor-card {
  background: #141324 !important;
}

.bg-gradient-advisor {
  background: linear-gradient(135deg, rgba(88, 28, 135, 0.25) 0%, rgba(15, 23, 42, 0.4) 100%);
}

.strategy-subcard {
  background: rgba(255, 255, 255, 0.02) !important;
  border-width: 1px !important;
}

.border-error {
  border-color: rgba(244, 67, 54, 0.6) !important;
}

.border-amber {
  border-color: rgba(255, 193, 7, 0.4) !important;
}

.text-white-50 {
  color: rgba(255, 255, 255, 0.8) !important;
}
</style>
