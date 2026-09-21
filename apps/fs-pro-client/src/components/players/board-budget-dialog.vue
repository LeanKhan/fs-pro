<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    max-width="720"
    persistent
  >
    <v-card class="board-budget-modal" rounded="lg" color="#0f172a">
      <!-- Modal Header -->
      <v-card-title class="pa-4 pb-3 d-flex justify-space-between align-center border-b border-slate-700">
        <div class="d-flex align-center gap-3">
          <v-avatar size="42" color="amber-darken-3" class="elevation-3 border border-amber-500/40">
            <v-icon color="white" size="24">mdi-briefcase-account</v-icon>
          </v-avatar>
          <div>
            <div class="text-subtitle-1 font-weight-black text-slate-100 d-flex align-center gap-2">
              Boardroom Capital Request
              <v-chip size="x-small" color="cyan-accent-3" variant="tonal" class="font-weight-medium">
                Jev AI Board of Directors
              </v-chip>
            </div>
            <div class="text-caption text-slate-400">
              {{ club?.Name }} • Fiduciary Review
            </div>
          </div>
        </div>

        <div class="d-flex align-center gap-2">
          <v-chip color="emerald-darken-3" variant="flat" class="font-weight-bold text-white text-caption">
            Budget: {{ currency(currentBudget) }}
          </v-chip>
          <v-btn icon="mdi-close" variant="text" size="small" color="slate-400" @click="close" />
        </div>
      </v-card-title>

      <!-- Modal Content -->
      <v-card-text class="pa-4 bg-slate-900" style="max-height: 560px; overflow-y: auto;">
        <!-- Financial Overview Dashboard -->
        <v-sheet rounded="lg" class="pa-3 bg-slate-800/80 border border-slate-700/60 mb-4">
          <div class="text-caption font-weight-bold text-slate-400 text-uppercase tracking-wider mb-2">
            Club Financial Health & Liquidity
          </div>
          <v-row dense>
            <v-col cols="6" sm="3">
              <div class="text-caption text-slate-400">Current Budget</div>
              <div class="text-body-2 font-weight-bold text-emerald-400">
                {{ currency(currentBudget) }}
              </div>
            </v-col>
            <v-col cols="6" sm="3">
              <div class="text-caption text-slate-400">Net Gate Receipts</div>
              <div class="text-body-2 font-weight-bold text-cyan-400">
                {{ currency(netMatchdayProfit) }}
              </div>
            </v-col>
            <v-col cols="6" sm="3">
              <div class="text-caption text-slate-400">Matchday Revenue</div>
              <div class="text-body-2 font-weight-bold text-slate-200">
                {{ currency(totalMatchdayRevenue) }}
              </div>
            </v-col>
            <v-col cols="6" sm="3">
              <div class="text-caption text-slate-400">Fiscal Status</div>
              <div class="text-body-2 font-weight-bold" :class="netMatchdayProfit > 0 ? 'text-emerald-400' : 'text-amber-400'">
                {{ netMatchdayProfit > 1_000_000 ? 'Healthy Cashflow' : 'Balanced' }}
              </div>
            </v-col>
          </v-row>
        </v-sheet>

        <!-- STATE 1: Request Pitch Form (Active before submission) -->
        <div v-if="!loading && !result" class="space-y-4">
          <!-- Amount Selector -->
          <div class="mb-4">
            <label class="text-body-2 font-weight-bold text-slate-200 d-block mb-1">
              Requested Transfer Budget Injection (€)
            </label>
            <v-text-field
              v-model.number="requestedAmount"
              type="number"
              prefix="€"
              variant="outlined"
              density="comfortable"
              color="cyan-accent-3"
              bg-color="slate-800"
              hint="Enter the additional transfer funding requested from club cash reserves."
              persistent-hint
              :min="100000"
              :step="100000"
            />

            <!-- Quick Amount Increment Chips -->
            <div class="d-flex flex-wrap gap-2 mt-2">
              <v-btn
                v-for="preset in presets"
                :key="preset.label"
                size="x-small"
                variant="tonal"
                color="cyan-lighten-2"
                @click="requestedAmount = preset.amount"
              >
                {{ preset.label }}
              </v-btn>
              <v-btn
                v-if="netMatchdayProfit > 0"
                size="x-small"
                variant="tonal"
                color="emerald-lighten-2"
                @click="requestedAmount = Math.round(netMatchdayProfit * 0.4)"
              >
                Reinvest 40% Gate Surplus ({{ currency(Math.round(netMatchdayProfit * 0.4)) }})
              </v-btn>
            </div>
          </div>

          <!-- Strategic Justification Selector -->
          <div class="mb-4">
            <label class="text-body-2 font-weight-bold text-slate-200 d-block mb-1">
              Sporting Justification for the Board
            </label>
            <v-radio-group v-model="justification" color="amber-darken-2" class="mt-1">
              <v-radio
                value="REINVEST_PROFITS"
                label="Reinvest Matchday Profits: Channel our commercial surplus into squad reinforcement"
                class="mb-1"
              />
              <v-radio
                value="TITLE_CHALLENGE"
                label="Title Ambition: Target transformative signings for silverware contention"
                class="mb-1"
              />
              <v-radio
                value="PROMOTION_PUSH"
                label="Promotion Drive: Secure decisive caliber to guarantee top-flight promotion"
                class="mb-1"
              />
              <v-radio
                value="SQUAD_DEPTH"
                label="Squad Depth & Injury Protection: Safeguard our campaign across congested fixtures"
              />
            </v-radio-group>
          </div>

          <!-- Governance Info Notice -->
          <v-alert
            color="slate-800"
            variant="flat"
            density="compact"
            class="border border-slate-700 text-caption text-slate-300"
          >
            <div class="d-flex align-center gap-2">
              <v-icon size="small" color="cyan-accent-3">mdi-information-outline</v-icon>
              <span>
                The Board, advised by the <strong>Jev AI Decision Engine</strong>, weighs current matchday profits, wage solvency, and sporting objectives. Applications may be approved in full, partially granted, or declined.
              </span>
            </div>
          </v-alert>

          <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-3">
            {{ error }}
          </v-alert>
        </div>

        <!-- STATE 2: Loading Review Screen -->
        <div v-else-if="loading" class="py-12 text-center">
          <v-progress-circular indeterminate color="amber-accent-3" size="56" width="4" class="mb-4" />
          <div class="text-subtitle-1 font-weight-black text-slate-100">
            Boardroom Deliberation in Progress
          </div>
          <div class="text-caption text-slate-400 mt-1">
            The Chairman and Finance Committee are consulting Jev Decision Engine...
          </div>
          <div class="text-caption text-cyan-400 mt-2 font-italic">
            Evaluating liquidity buffers, wage coverage, and competitive viability.
          </div>
        </div>

        <!-- STATE 3: Boardroom Verdict Result -->
        <div v-else-if="result" class="space-y-4">
          <!-- Hero Verdict Card -->
          <v-sheet
            rounded="lg"
            class="pa-4 border"
            :class="verdictTheme.cardClass"
          >
            <div class="d-flex justify-space-between align-center mb-3">
              <div class="d-flex align-center gap-3">
                <v-avatar :color="verdictTheme.avatarColor" size="44" class="elevation-3">
                  <v-icon color="white" size="24">{{ verdictTheme.icon }}</v-icon>
                </v-avatar>
                <div>
                  <div class="text-caption font-weight-bold text-slate-400 uppercase tracking-wider">
                    Official Board Resolution
                  </div>
                  <div class="text-h6 font-weight-black" :class="verdictTheme.textClass">
                    {{ verdictTheme.title }}
                  </div>
                </div>
              </div>

              <!-- Jev Source Badge -->
              <v-chip
                size="x-small"
                :color="result.source === 'jev' ? 'cyan-accent-3' : 'grey'"
                variant="tonal"
              >
                {{ result.source === 'jev' ? 'Powered by Jev AI' : 'Local Governance' }}
              </v-chip>
            </div>

            <!-- Grant Breakdown Banner -->
            <div class="bg-slate-900/70 rounded-lg pa-3 mb-3 border border-slate-700/50 d-flex justify-space-between align-center">
              <div>
                <span class="text-caption text-slate-400">Granted Allocation:</span>
                <div class="text-h5 font-weight-black text-white">
                  {{ currency(result.grantedAmount) }}
                  <span class="text-caption text-slate-400 font-weight-regular" v-if="result.requestedAmount > 0">
                    ({{ Math.round((result.grantedAmount / result.requestedAmount) * 100) }}% of requested {{ currency(result.requestedAmount) }})
                  </span>
                </div>
              </div>
              <div class="text-right">
                <span class="text-caption text-slate-400">Updated Transfer Budget:</span>
                <div class="text-h6 font-weight-bold text-emerald-400">
                  {{ currency(result.newBudget) }}
                </div>
              </div>
            </div>

            <!-- Chairman's Official Narrative Letter -->
            <div class="border-t border-slate-700/60 pt-3">
              <div class="text-caption font-weight-bold text-slate-400 mb-1 d-flex align-center gap-1">
                <v-icon size="14">mdi-format-quote-open</v-icon>
                Statement from the Chairman:
              </div>
              <div class="text-body-2 text-slate-200 leading-relaxed italic px-2">
                "{{ result.boardStatement }}"
              </div>
            </div>
          </v-sheet>
        </div>
      </v-card-text>

      <!-- Modal Footer Actions -->
      <v-card-actions class="pa-4 bg-slate-800/90 border-t border-slate-700 d-flex justify-space-between align-center">
        <v-btn
          v-if="!result"
          variant="plain"
          color="slate-400"
          :disabled="loading"
          @click="close"
        >
          Cancel
        </v-btn>

        <div v-if="!result" class="d-flex align-center gap-2">
          <v-btn
            color="amber-darken-2"
            variant="flat"
            :loading="loading"
            :disabled="loading || requestedAmount <= 0"
            class="font-weight-bold px-4"
            prepend-icon="mdi-send-check"
            @click="submitRequest"
          >
            Submit to Board ({{ currency(requestedAmount) }})
          </v-btn>
        </div>

        <div v-else class="d-flex justify-end w-100">
          <v-btn
            color="primary"
            variant="flat"
            class="font-weight-bold px-6"
            @click="finishAndClose"
          >
            {{ result.grantedAmount > 0 ? 'Acknowledge & Update Budget' : 'Close Boardroom' }}
          </v-btn>
        </div>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { client } from '@/services/api';
import { currency } from '@/helpers/misc';

interface Props {
  modelValue: boolean;
  club: any;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'budget-updated': [newBudget: number];
}>();

const requestedAmount = ref(1_000_000);
const justification = ref<'TITLE_CHALLENGE' | 'REINVEST_PROFITS' | 'PROMOTION_PUSH' | 'SQUAD_DEPTH'>('REINVEST_PROFITS');
const loading = ref(false);
const error = ref<string | null>(null);
const result = ref<any | null>(null);

const currentBudget = computed(() => Number(props.club?.Budget ?? 0));
const finances = computed(() => (props.club?.Finances as Record<string, any>) || {});
const totalMatchdayRevenue = computed(() => Number(finances.value.totalMatchdayRevenue ?? 0));
const totalMatchdayCosts = computed(() => Number(finances.value.totalMatchdayCosts ?? 0));
const netMatchdayProfit = computed(() => Math.max(0, totalMatchdayRevenue.value - totalMatchdayCosts.value));

const presets = [
  { label: '+€500K', amount: 500_000 },
  { label: '+€1.0M', amount: 1_000_000 },
  { label: '+€2.5M', amount: 2_500_000 },
  { label: '+€5.0M', amount: 5_000_000 },
];

function close() {
  emit('update:modelValue', false);
  // Reset for next time if already viewed
  if (result.value) {
    result.value = null;
    error.value = null;
  }
}

function finishAndClose() {
  if (result.value?.grantedAmount > 0) {
    emit('budget-updated', result.value.newBudget);
  }
  close();
}

async function submitRequest() {
  const clubId = props.club?._id || props.club?.id;
  if (!clubId) return;

  loading.value = true;
  error.value = null;

  try {
    const res = await client.transfers.requestBudgetIncrease.mutation({
      body: {
        clubId,
        amount: requestedAmount.value,
        justification: justification.value,
      },
    });

    if (res.status === 200 && res.body?.success) {
      result.value = res.body.payload;
    } else {
      error.value = (res.body as any)?.message || 'Failed to submit budget request to the board.';
    }
  } catch (err: any) {
    console.error('Error in board budget request:', err);
    error.value = err?.message || 'Network error submitting request to the Board.';
  } finally {
    loading.value = false;
  }
}

const verdictTheme = computed(() => {
  const status = result.value?.status;
  switch (status) {
    case 'ACCEPTED':
      return {
        title: 'APPLICATION APPROVED IN FULL',
        icon: 'mdi-check-decagram',
        cardClass: 'bg-emerald-950/70 border-emerald-500/60 shadow-lg shadow-emerald-950/40',
        textClass: 'text-emerald-400',
        avatarColor: 'emerald-darken-2',
      };
    case 'COMPROMISE':
      return {
        title: 'PARTIAL COMPROMISE SANCTIONED',
        icon: 'mdi-handshake',
        cardClass: 'bg-blue-950/70 border-blue-500/60 shadow-lg shadow-blue-950/40',
        textClass: 'text-blue-400',
        avatarColor: 'blue-darken-2',
      };
    case 'REJECTED':
      return {
        title: 'APPLICATION REFUSED',
        icon: 'mdi-close-octagon',
        cardClass: 'bg-rose-950/70 border-rose-500/60 shadow-lg shadow-rose-950/40',
        textClass: 'text-rose-400',
        avatarColor: 'rose-darken-3',
      };
    default:
      return {
        title: 'BOARD DELIBERATION',
        icon: 'mdi-briefcase-account',
        cardClass: 'bg-slate-800 border-slate-700',
        textClass: 'text-slate-200',
        avatarColor: 'indigo-darken-2',
      };
  }
});
</script>

<style scoped>
.board-budget-modal {
  border: 1px solid rgba(245, 158, 11, 0.25);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
}
</style>
