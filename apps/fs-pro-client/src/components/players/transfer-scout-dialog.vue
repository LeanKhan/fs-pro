<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    max-width="840"
    scrollable
  >
    <v-card class="transfer-scout-dialog" rounded="lg" color="#0f172a">
      <!-- Header with Player Identity & Close -->
      <v-card-title class="pa-4 pb-2 d-flex justify-space-between align-center border-b border-slate-700">
        <div class="d-flex align-center gap-3">
          <v-avatar size="44" color="indigo-darken-3" class="elevation-2 border border-slate-600">
            <span class="text-subtitle-1 font-weight-bold text-white">
              {{ player?.ShirtNumber || '—' }}
            </span>
          </v-avatar>
          <div>
            <div class="d-flex align-center gap-2">
              <span class="text-h6 font-weight-bold text-white">
                {{ player?.FirstName }} {{ player?.LastName }}
              </span>
              <v-chip
                size="small"
                :color="getPositionColor(player?.Position)"
                variant="flat"
                class="font-weight-bold text-white px-2"
              >
                {{ player?.Position }}
              </v-chip>
              <v-chip
                v-if="player?.isYouth"
                size="x-small"
                color="teal-accent-4"
                variant="flat"
                class="text-black font-weight-bold"
              >
                Youth
              </v-chip>
            </div>
            <div class="text-caption text-slate-400 d-flex flex-wrap align-center gap-2 mt-1">
              <span>🌍 {{ getPlayerNationality(player) }}</span>
              <span>•</span>
              <span>Age {{ player?.Age }}</span>
              <span>•</span>
              <span>{{ player?.source || (player?.ClubId ? 'Club Player' : 'Free Agent') }}</span>
            </div>
          </div>
        </div>

        <div class="d-flex align-center gap-3">
          <div class="text-right">
            <v-chip
              size="default"
              color="amber-darken-1"
              variant="flat"
              class="font-weight-black text-black px-3 text-subtitle-2 elevation-2"
            >
              OVR {{ Math.round(player?.Rating ?? 60) }}
            </v-chip>
          </div>
          <v-btn icon="mdi-close" variant="text" size="small" color="slate-400" @click="close" />
        </div>
      </v-card-title>

      <!-- Subheader Quick Bio Strip -->
      <div class="px-4 py-2 bg-slate-800/80 d-flex flex-wrap justify-space-between align-center border-b border-slate-700/60">
        <div class="d-flex flex-wrap align-center gap-4 text-body-2">
          <div>
            <span class="text-caption text-slate-400 mr-1">Market Value:</span>
            <strong class="text-emerald-400">{{ currency(player?.Value) }}</strong>
          </div>
          <div>
            <span class="text-caption text-slate-400 mr-1">Wage:</span>
            <strong class="text-slate-200">{{ currency(player?.Wage) }}<span class="text-caption text-slate-400">/yr</span></strong>
          </div>
          <div>
            <span class="text-caption text-slate-400 mr-1">Foot:</span>
            <strong class="text-slate-200">{{ player?.Attributes?.PreferredFoot || 'Right' }}</strong>
          </div>
          <div>
            <span class="text-caption text-slate-400 mr-1">Form:</span>
            <strong class="text-cyan-400">{{ player?.Form ? Number(player.Form).toFixed(1) : '7.0' }} / 10</strong>
          </div>
        </div>

        <!-- Mode Toggle Tabs -->
        <v-btn-toggle
          v-model="activeTab"
          mandatory
          density="compact"
          color="primary"
          variant="tonal"
          class="rounded-lg"
        >
          <v-btn value="scout" size="small" class="text-caption px-3">
            <v-icon start size="14">mdi-brain</v-icon>
            Jev AI Scouting
          </v-btn>
          <v-btn value="attributes" size="small" class="text-caption px-3">
            <v-icon start size="14">mdi-chart-box-outline</v-icon>
            Full Attributes
          </v-btn>
        </v-btn-toggle>
      </div>

      <!-- Main Body -->
      <v-card-text class="pa-4 bg-slate-900" style="min-height: 380px; max-height: 560px; overflow-y: auto;">
        <!-- TAB 1: Jev AI Transfer Scouting Analysis -->
        <div v-show="activeTab === 'scout'" class="space-y-4">
          <!-- Loading State -->
          <div v-if="loading" class="py-10 text-center">
            <v-progress-circular indeterminate color="cyan-accent-3" size="56" width="4" class="mb-4" />
            <div class="text-subtitle-1 font-weight-bold text-slate-200">
              Jev AI Scouting Intelligence
            </div>
            <div class="text-caption text-slate-400 mt-1">
              Evaluating tactical fit, budget efficiency, and squad hierarchy...
            </div>
          </div>

          <!-- Error State -->
          <v-alert
            v-else-if="scoutError"
            type="warning"
            variant="tonal"
            density="comfortable"
            class="mb-3"
          >
            <div class="d-flex justify-space-between align-center">
              <span>{{ scoutError }}</span>
              <v-btn size="x-small" variant="text" color="amber-lighten-2" @click="fetchScoutReport">
                Retry Scouting
              </v-btn>
            </div>
          </v-alert>

          <!-- Report Display -->
          <div v-else-if="report" class="d-flex flex-column gap-3">
            <!-- Hero Decision Banner -->
            <v-sheet
              rounded="lg"
              class="pa-4 border transition-all"
              :class="recommendationTheme.cardClass"
            >
              <div class="d-flex flex-wrap justify-space-between align-center gap-3">
                <div class="d-flex align-center gap-3">
                  <v-avatar :color="recommendationTheme.avatarColor" size="48" class="elevation-3">
                    <v-icon color="white" size="28">{{ recommendationTheme.icon }}</v-icon>
                  </v-avatar>
                  <div>
                    <div class="d-flex align-center gap-2">
                      <span class="text-caption font-weight-bold text-slate-400 uppercase tracking-wider">
                        Jev AI Verdict
                      </span>
                      <v-chip
                        size="x-small"
                        :color="report.source === 'jev' ? 'cyan-accent-3' : 'grey'"
                        variant="tonal"
                        class="font-weight-medium"
                      >
                        <span class="status-pulse mr-1" v-if="report.source === 'jev'"></span>
                        {{ report.source === 'jev' ? 'Powered by Jev AI' : 'Local Decision Engine' }}
                      </v-chip>
                    </div>
                    <div class="text-h5 font-weight-black mt-0.5" :class="recommendationTheme.textClass">
                      {{ recommendationTheme.title }}
                    </div>
                  </div>
                </div>

                <!-- Deal Rating & Confidence Meter -->
                <div class="d-flex align-center gap-4 text-right">
                  <div>
                    <div class="text-caption text-slate-400">Deal Score</div>
                    <div class="d-flex align-baseline justify-end gap-1">
                      <span class="text-h4 font-weight-black" :class="recommendationTheme.textClass">
                        {{ report.dealRating }}
                      </span>
                      <span class="text-caption text-slate-400 font-weight-bold">/100</span>
                    </div>
                  </div>
                  <v-progress-circular
                    :model-value="report.dealRating"
                    :color="recommendationTheme.progressColor"
                    size="48"
                    width="5"
                    rotate="-90"
                  >
                    <span class="text-caption font-weight-bold">{{ report.confidence }}%</span>
                  </v-progress-circular>
                </div>
              </div>

              <!-- Executive Narrative Summary -->
              <div class="mt-3 text-body-2 text-slate-200 border-t border-slate-700/50 pt-3 leading-relaxed">
                {{ report.verdict }}
              </div>
            </v-sheet>

            <!-- 3 Analytical Pillars (Tactics, Squad Role, Financial) -->
            <v-row dense class="mt-1">
              <!-- Pillar 1: Tactical Fit -->
              <v-col cols="12" md="4">
                <v-card class="pa-3 h-100 bg-slate-800/90 border border-slate-700/70" rounded="lg">
                  <div class="d-flex justify-space-between align-center mb-2">
                    <span class="text-caption font-weight-bold text-slate-400">
                      <v-icon size="15" class="mr-1 text-cyan-400">mdi-strategy</v-icon>
                      Tactical Fit
                    </span>
                    <v-chip
                      size="x-small"
                      :color="getFitColor(report.tacticalFitLevel)"
                      variant="flat"
                      class="font-weight-bold"
                    >
                      {{ report.tacticalFitLevel }}
                    </v-chip>
                  </div>
                  <div class="text-caption text-slate-300 leading-relaxed">
                    {{ report.tacticalFit }}
                  </div>
                </v-card>
              </v-col>

              <!-- Pillar 2: Squad Impact & Comparison -->
              <v-col cols="12" md="4">
                <v-card class="pa-3 h-100 bg-slate-800/90 border border-slate-700/70" rounded="lg">
                  <div class="d-flex justify-space-between align-center mb-2">
                    <span class="text-caption font-weight-bold text-slate-400">
                      <v-icon size="15" class="mr-1 text-purple-400">mdi-account-switch</v-icon>
                      Squad Role
                    </span>
                    <v-chip
                      size="x-small"
                      :color="getRoleColor(report.squadRoleLevel)"
                      variant="flat"
                      class="font-weight-bold"
                    >
                      {{ formatRoleLevel(report.squadRoleLevel) }}
                    </v-chip>
                  </div>
                  <div class="text-caption text-slate-300 leading-relaxed mb-2">
                    {{ report.squadRole }}
                  </div>
                  <!-- Comparison stats pill -->
                  <div class="text-caption text-slate-400 bg-slate-900/60 rounded px-2 py-1 d-flex justify-space-between align-center">
                    <span>Pos. Depth: <strong>{{ report.comparisonWithSquad.samePositionCount }}</strong></span>
                    <span>
                      Starter Delta:
                      <strong :class="report.comparisonWithSquad.ratingDelta >= 0 ? 'text-emerald-400' : 'text-amber-400'">
                        {{ report.comparisonWithSquad.ratingDelta >= 0 ? '+' : '' }}{{ report.comparisonWithSquad.ratingDelta }} OVR
                      </strong>
                    </span>
                  </div>
                </v-card>
              </v-col>

              <!-- Pillar 3: Financial Efficiency -->
              <v-col cols="12" md="4">
                <v-card class="pa-3 h-100 bg-slate-800/90 border border-slate-700/70" rounded="lg">
                  <div class="d-flex justify-space-between align-center mb-2">
                    <span class="text-caption font-weight-bold text-slate-400">
                      <v-icon size="15" class="mr-1 text-emerald-400">mdi-cash-multiple</v-icon>
                      Budget Impact
                    </span>
                    <v-chip
                      size="x-small"
                      :color="canAfford ? 'emerald-lighten-1' : 'error'"
                      variant="tonal"
                      class="font-weight-bold"
                    >
                      {{ canAfford ? 'Affordable' : 'Over Budget' }}
                    </v-chip>
                  </div>
                  <div class="text-caption text-slate-300 leading-relaxed">
                    {{ report.financialAssessment }}
                  </div>
                  <div class="mt-2 text-caption text-slate-400">
                    Your Budget: <strong class="text-emerald-400">{{ currency(myBudget) }}</strong>
                  </div>
                </v-card>
              </v-col>
            </v-row>
          </div>
        </div>

        <!-- TAB 2: Full Categorized Attributes -->
        <div v-show="activeTab === 'attributes'" class="space-y-4">
          <!-- Attribute Breakdown Sections -->
          <div
            v-for="group in playerAttributeGroups"
            :key="group.category"
            class="mb-3 bg-slate-800/60 rounded-lg pa-3 border border-slate-700/60"
          >
            <div class="text-caption font-weight-bold text-slate-400 mb-2 text-uppercase tracking-wider">
              {{ group.category }}
            </div>
            <v-row dense>
              <v-col
                v-for="attr in group.items"
                :key="attr.name"
                cols="6"
                sm="4"
              >
                <div class="d-flex justify-space-between align-center text-caption mb-1">
                  <span class="text-truncate text-slate-300 mr-1" :title="attr.name">{{ attr.name }}</span>
                  <span
                    class="font-weight-bold"
                    :class="`text-${getAttrColor(attr.value)}`"
                  >
                    {{ attr.value }}
                  </span>
                </div>
                <v-progress-linear
                  :model-value="attr.value"
                  :color="getAttrColor(attr.value)"
                  height="5"
                  rounded
                  bg-color="slate-700"
                ></v-progress-linear>
              </v-col>
            </v-row>
          </div>
        </div>
      </v-card-text>

      <!-- Footer Actions -->
      <v-card-actions class="pa-4 bg-slate-800/90 border-t border-slate-700 d-flex justify-space-between align-center">
        <div class="text-caption text-slate-400">
          <template v-if="!windowOpen">
            <v-icon size="small" color="warning" class="mr-1">mdi-alert-circle</v-icon>
            Transfer window is currently closed.
          </template>
          <template v-else-if="!canAfford">
            <v-icon size="small" color="error" class="mr-1">mdi-cash-remove</v-icon>
            Player value exceeds current available budget.
          </template>
          <template v-else>
            Ready for acquisition or formal transfer bid.
          </template>
        </div>

        <div class="d-flex align-center gap-2">
          <v-btn variant="plain" color="slate-400" @click="close">
            Close
          </v-btn>

          <v-tooltip
            :disabled="canAfford && windowOpen"
            location="top"
          >
            <template #activator="{ props: tipProps }">
              <span v-bind="tipProps">
                <v-btn
                  color="success"
                  variant="flat"
                  :disabled="!canAfford || !windowOpen"
                  class="font-weight-bold px-4"
                  prepend-icon="mdi-cash-plus"
                  @click="initiatePurchase"
                >
                  {{ isBid ? 'Place Bid' : 'Buy Player' }} ({{ currency(player?.Value) }})
                </v-btn>
              </span>
            </template>
            <span>
              {{ !windowOpen ? 'Transfer window is closed' : 'Not enough budget for this transfer' }}
            </span>
          </v-tooltip>
        </div>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { client } from '@/services/api';
import { currency } from '@/helpers/misc';
import type { MarketPlayer } from './transfer-market-table.vue';

interface Props {
  modelValue: boolean;
  player: MarketPlayer | null;
  clubId: string;
  myBudget: number;
  windowOpen?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  windowOpen: true,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'buy-player': [player: MarketPlayer];
}>();

const activeTab = ref<'scout' | 'attributes'>('scout');
const loading = ref(false);
const report = ref<any | null>(null);
const scoutError = ref<string | null>(null);
const cachedPlayerId = ref<string | null>(null);

const canAfford = computed(() => {
  if (!props.player) return false;
  return (props.player.Value ?? 0) <= props.myBudget;
});

const isBid = computed(() => !!props.player?.ClubId);

function close() {
  emit('update:modelValue', false);
}

function initiatePurchase() {
  if (props.player) {
    emit('buy-player', props.player);
    close();
  }
}

async function fetchScoutReport() {
  if (!props.player || !props.clubId) return;

  const targetId = props.player.id || (props.player as any)._id;
  if (!targetId) return;

  loading.value = true;
  scoutError.value = null;

  try {
    const res = await client.transfers.scoutPlayerTransfer.mutation({
      body: {
        playerId: targetId,
        clubId: props.clubId,
      },
    });

    if (res.status === 200 && res.body?.success) {
      report.value = res.body.payload;
      cachedPlayerId.value = targetId;
    } else {
      scoutError.value = (res.body as any)?.message || 'Scouting evaluation could not be completed.';
    }
  } catch (err: any) {
    console.error('Failed to scout player transfer:', err);
    scoutError.value = err?.message || 'Network error fetching Jev scouting intelligence.';
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.modelValue, props.player],
  ([visible, p]) => {
    if (visible && p) {
      const targetId = (p as any).id || (p as any)._id;
      if (targetId !== cachedPlayerId.value) {
        report.value = null;
        fetchScoutReport();
      }
    }
  },
  { immediate: true }
);

const recommendationTheme = computed(() => {
  const rec = report.value?.recommendation;
  switch (rec) {
    case 'MUST_BUY':
      return {
        title: 'MUST-BUY SIGNING',
        icon: 'mdi-star-check-outline',
        cardClass: 'bg-emerald-950/70 border-emerald-500/60 shadow-lg shadow-emerald-950/40',
        textClass: 'text-emerald-400',
        avatarColor: 'emerald-darken-2',
        progressColor: 'emerald-accent-3',
      };
    case 'RECOMMENDED':
      return {
        title: 'HIGHLY RECOMMENDED',
        icon: 'mdi-thumb-up-outline',
        cardClass: 'bg-blue-950/70 border-blue-500/60 shadow-lg shadow-blue-950/40',
        textClass: 'text-blue-400',
        avatarColor: 'blue-darken-2',
        progressColor: 'blue-accent-2',
      };
    case 'ROTATION':
      return {
        title: 'SQUAD ROTATION FIT',
        icon: 'mdi-account-switch-outline',
        cardClass: 'bg-teal-950/70 border-teal-500/60 shadow-lg shadow-teal-950/40',
        textClass: 'text-teal-400',
        avatarColor: 'teal-darken-2',
        progressColor: 'teal-accent-3',
      };
    case 'OVERPRICED':
      return {
        title: 'OVERPRICED TARGET',
        icon: 'mdi-currency-usd-off',
        cardClass: 'bg-amber-950/70 border-amber-500/60 shadow-lg shadow-amber-950/40',
        textClass: 'text-amber-400',
        avatarColor: 'amber-darken-3',
        progressColor: 'amber-accent-3',
      };
    case 'HIGH_RISK':
      return {
        title: 'HIGH RISK ACQUISITION',
        icon: 'mdi-alert-octagon-outline',
        cardClass: 'bg-rose-950/70 border-rose-500/60 shadow-lg shadow-rose-950/40',
        textClass: 'text-rose-400',
        avatarColor: 'rose-darken-3',
        progressColor: 'rose-accent-3',
      };
    default:
      return {
        title: 'SCOUT EVALUATION',
        icon: 'mdi-brain',
        cardClass: 'bg-slate-800 border-slate-700',
        textClass: 'text-slate-200',
        avatarColor: 'indigo-darken-2',
        progressColor: 'primary',
      };
  }
});

function getFitColor(level?: string): string {
  switch (level) {
    case 'EXCELLENT':
      return 'emerald-lighten-1';
    case 'GOOD':
      return 'cyan-lighten-1';
    case 'NEUTRAL':
      return 'amber-lighten-1';
    case 'POOR':
      return 'error';
    default:
      return 'grey';
  }
}

function getRoleColor(level?: string): string {
  switch (level) {
    case 'STARTER_UPGRADE':
      return 'purple-lighten-1';
    case 'KEY_DEPTH':
      return 'indigo-lighten-2';
    case 'FUTURE_PROSPECT':
      return 'teal-lighten-1';
    case 'SURPLUS':
      return 'amber-darken-2';
    default:
      return 'grey';
  }
}

function formatRoleLevel(level?: string): string {
  switch (level) {
    case 'STARTER_UPGRADE':
      return 'Starter Upgrade';
    case 'KEY_DEPTH':
      return 'Key Depth';
    case 'FUTURE_PROSPECT':
      return 'Future Prospect';
    case 'SURPLUS':
      return 'Surplus';
    default:
      return level || 'Standard';
  }
}

function getPositionColor(pos?: string): string {
  switch (pos) {
    case 'GK':
      return 'amber-darken-2';
    case 'DEF':
      return 'blue-darken-2';
    case 'MID':
      return 'green-darken-2';
    case 'ATT':
      return 'red-darken-2';
    default:
      return 'indigo';
  }
}

function getAttrColor(val: number): string {
  if (val >= 80) return 'success';
  if (val >= 65) return 'info';
  if (val >= 50) return 'amber-darken-1';
  return 'error';
}

function getPlayerNationality(p: any): string {
  if (!p) return 'Unknown';
  if (typeof p.Nationality === 'string') return p.Nationality;
  if (p.Nationality?.name) return p.Nationality.name;
  if (p.Country) return p.Country;
  return 'Unknown';
}

const playerAttributeGroups = computed(() => {
  if (!props.player) return [];
  const attrs = (props.player.Attributes as Record<string, any>) ?? {};

  const getVal = (name: string, fallbackName?: string) => {
    return Math.round(attrs[name] ?? (fallbackName ? attrs[fallbackName] : 0) ?? 0);
  };

  return [
    {
      category: 'Pace & Physical',
      items: [
        { name: 'Pace / Speed', value: getVal('Speed') },
        { name: 'Stamina', value: getVal('Stamina') },
        { name: 'Strength', value: getVal('Strength') },
        { name: 'Agility', value: getVal('Agility') },
      ],
    },
    {
      category: 'Technical & Passing',
      items: [
        { name: 'Short Pass', value: getVal('ShortPass') },
        { name: 'Long Pass', value: getVal('LongPass') },
        { name: 'Ball Control', value: getVal('Control') },
        { name: 'Dribbling', value: getVal('Dribbling') },
        { name: 'Crossing', value: getVal('Crossing') },
        { name: 'Set Piece', value: getVal('Setpiece', 'SetPiece') },
      ],
    },
    {
      category: 'Attacking & Shooting',
      items: [
        { name: 'Shooting / Finishing', value: getVal('Shooting') },
        { name: 'Shot Power', value: getVal('ShotPower') },
        { name: 'Long Shot', value: getVal('LongShot') },
        { name: 'Vision', value: getVal('Vision') },
        { name: 'Positioning', value: getVal('Positioning') },
      ],
    },
    {
      category: 'Defending & Mental',
      items: [
        { name: 'Tackling', value: getVal('Tackling') },
        { name: 'Marking', value: getVal('Marking') },
        { name: 'Interceptions', value: getVal('Interception') },
        { name: 'Aggression', value: getVal('Aggression') },
        { name: 'Mental / Composure', value: getVal('Mental') },
      ],
    },
    ...(props.player.Position === 'GK' || getVal('Keeping') > 30
      ? [
          {
            category: 'Goalkeeping',
            items: [
              { name: 'Goalkeeping', value: getVal('Keeping') },
              { name: 'Positioning', value: getVal('Positioning') },
              { name: 'Mental', value: getVal('Mental') },
              { name: 'Long Pass', value: getVal('LongPass') },
            ],
          },
        ]
      : []),
  ];
});
</script>

<style scoped>
.transfer-scout-dialog {
  border: 1px solid rgba(148, 163, 184, 0.15);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
}

.status-pulse {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #67e8f9;
  box-shadow: 0 0 8px #67e8f9;
  animation: pulse 1.8s infinite;
}

@keyframes pulse {
  0% {
    transform: scale(0.9);
    opacity: 0.7;
  }
  50% {
    transform: scale(1.3);
    opacity: 1;
  }
  100% {
    transform: scale(0.9);
    opacity: 0.7;
  }
}
</style>
