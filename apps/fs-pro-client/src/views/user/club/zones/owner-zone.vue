<template>
  <div class="owner-zone">
    <v-row>
      <!-- Financial Summary Cards -->
      <v-col cols="12" md="3">
        <v-card class="pa-4 stat-card bg-surface-variant elevation-3">
          <div class="text-caption text-medium-emphasis">Club Treasury</div>
          <div class="text-h5 font-weight-bold text-success mt-1">
            {{ formatCurrency(club?.Budget ?? 1000000) }}
          </div>
          <div class="text-caption text-medium-emphasis mt-2">Available for transfers & wages</div>
        </v-card>
      </v-col>

      <v-col cols="12" md="3">
        <v-card class="pa-4 stat-card bg-surface-variant elevation-3">
          <div class="text-caption text-medium-emphasis">Annual Wage Bill</div>
          <div class="text-h5 font-weight-bold text-warning mt-1">
            {{ formatCurrency(totalAnnualWages) }}
          </div>
          <div class="text-caption text-medium-emphasis mt-2">{{ activePlayersCount }} signed players</div>
        </v-card>
      </v-col>

      <v-col cols="12" md="3">
        <v-card class="pa-4 stat-card bg-surface-variant elevation-3">
          <div class="text-caption text-medium-emphasis">Matchday Revenue</div>
          <div class="text-h5 font-weight-bold text-info mt-1">
            {{ formatCurrency(club?.Finances?.totalMatchdayRevenue ?? 0) }}
          </div>
          <div class="text-caption text-medium-emphasis mt-2">Gate receipts & concessions</div>
        </v-card>
      </v-col>

      <v-col cols="12" md="3">
        <v-card class="pa-4 stat-card bg-surface-variant elevation-3">
          <div class="text-caption text-medium-emphasis">Net Operating Margin</div>
          <div
            class="text-h5 font-weight-bold mt-1"
            :class="netMargin >= 0 ? 'text-success' : 'text-error'"
          >
            {{ formatCurrency(netMargin) }}
          </div>
          <div class="text-caption text-medium-emphasis mt-2">Match profits minus match costs</div>
        </v-card>
      </v-col>

      <!-- Stadium & Infrastructure -->
      <v-col cols="12" md="7">
        <play-panel
          :club-id="club?._id"
          :read-only="readOnly"
          @update-available="emit('update-available')"
        ></play-panel>

        <facilities-panel
          :club-id="club?._id"
          :read-only="readOnly"
          @update-available="emit('update-available')"
        ></facilities-panel>

        <!-- Matchday Ledger -->
        <v-card class="pa-4 elevation-3">
          <div class="text-h6 font-weight-bold mb-2">Matchday Financial Ledger</div>
          <v-table density="compact">
            <thead>
              <tr>
                <th>Date</th>
                <th>Attendance</th>
                <th>Revenue</th>
                <th>Match Costs</th>
                <th>Net Profit</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, idx) in matchHistory" :key="idx">
                <td>{{ formatDate(item.date) }}</td>
                <td>{{ item.attendance?.toLocaleString() ?? 'N/A' }}</td>
                <td class="text-success">{{ formatCurrency(item.revenue ?? 0) }}</td>
                <td class="text-error">{{ formatCurrency(item.costs ?? 0) }}</td>
                <td class="font-weight-bold" :class="item.net >= 0 ? 'text-success' : 'text-error'">
                  {{ formatCurrency(item.net ?? 0) }}
                </td>
              </tr>
              <tr v-if="matchHistory.length === 0">
                <td colspan="5" class="text-center text-medium-emphasis py-4">
                  No home fixtures played yet this season.
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-col>

      <!-- Manager & Boardroom Oversight -->
      <v-col cols="12" md="5">
        <v-card class="pa-4 elevation-3 mb-4">
          <div class="text-h6 font-weight-bold mb-3">Manager & Technical Staff</div>

          <div v-if="club?.Manager" class="d-flex align-center gap-3 mb-3">
            <v-avatar size="50" color="grey-darken-3">
              <v-icon size="30">mdi-account-tie</v-icon>
            </v-avatar>
            <div>
              <div class="text-subtitle-1 font-weight-bold">
                {{ club.Manager.FirstName }} {{ club.Manager.LastName }}
              </div>
              <div class="text-caption text-medium-emphasis">
                Rating: {{ club.Manager.Rating ?? 65 }} | Preferred: {{ club.Manager.Tactic?.formationName ?? '4-3-3' }}
              </div>
            </div>
          </div>

          <div v-else class="text-body-2 text-warning mb-3">
            No manager currently under contract.
          </div>

          <v-row class="mb-2">
            <v-col cols="6">
              <div class="text-caption text-medium-emphasis">Board Confidence</div>
              <v-progress-linear
                :model-value="boardConfidence"
                :color="boardConfidence >= 50 ? 'success' : boardConfidence >= 35 ? 'warning' : 'error'"
                height="10"
                rounded
                class="mt-1"
              ></v-progress-linear>
              <span class="text-caption font-weight-bold">{{ boardConfidence }}%</span>
            </v-col>
            <v-col cols="6">
              <div class="text-caption text-medium-emphasis">Fan Approval</div>
              <v-progress-linear
                :model-value="fanApproval"
                color="info"
                height="10"
                rounded
                class="mt-1"
              ></v-progress-linear>
              <span class="text-caption font-weight-bold">{{ fanApproval }}%</span>
            </v-col>
          </v-row>

          <v-divider class="my-3"></v-divider>

          <div v-if="!readOnly" class="d-flex gap-2">
            <v-btn
              v-if="club?.Manager"
              color="error"
              variant="tonal"
              size="small"
              @click="openFireDialog = true"
            >
              Terminate Contract
            </v-btn>
            <v-btn
              v-else
              color="primary"
              variant="flat"
              size="small"
              @click="openHireDialog = true"
            >
              Hire Head Coach
            </v-btn>
          </div>
          <div v-else class="text-caption text-medium-emphasis">
            Appointed by Club Board
          </div>
        </v-card>

        <!-- Board Expectations -->
        <v-card class="pa-4 elevation-3">
          <div class="text-h6 font-weight-bold mb-3">Board Expectations</div>
          <v-list density="compact" class="pa-0">
            <v-list-item v-for="e in expectations" :key="e.title" class="px-0">
              <template #prepend>
                <v-icon :color="e.met ? 'success' : 'error'" class="mr-2">
                  {{ e.met ? 'mdi-check-circle-outline' : 'mdi-alert-circle-outline' }}
                </v-icon>
              </template>
              <v-list-item-title class="text-body-2">{{ e.title }}</v-list-item-title>
              <v-list-item-subtitle class="text-caption">{{ e.status }}</v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-card>
      </v-col>
    </v-row>

    <!-- Modals for hiring/firing -->
    <manager-picker
      v-model:show="openHireDialog"
      :club="club?._id"
      @update-available="emit('update-available')"
    ></manager-picker>
    <manager-firer
      v-model:show="openFireDialog"
      :manager="club?.Manager"
      :club="club?._id"
      @update-available="emit('update-available')"
    ></manager-firer>

    <v-snackbar v-model="snackbar" :timeout="3000" color="success">
      {{ snackbarText }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { currency } from '@/helpers/misc';
import { ManagerPicker, ManagerFirer } from '@/components/clubzone';
import FacilitiesPanel from './facilities-panel.vue';
import PlayPanel from './play-panel.vue';

const props = withDefaults(
  defineProps<{
    club?: any | null;
    readOnly?: boolean;
  }>(),
  {
    readOnly: false,
  }
);

const emit = defineEmits<{
  (e: 'update-available'): void;
}>();

const openHireDialog = ref(false);
const openFireDialog = ref(false);
const snackbar = ref(false);
const snackbarText = ref('');

const formatCurrency = (val: number) => currency(val);

const totalAnnualWages = computed(() => {
  if (!Array.isArray(props.club?.Players)) return 0;
  return props.club.Players.reduce((sum: number, p: any) => sum + (Number(p.Wage) || 0), 0);
});

const activePlayersCount = computed(() => {
  return Array.isArray(props.club?.Players) ? props.club.Players.length : 0;
});

const netMargin = computed(() => {
  const rev = Number(props.club?.Finances?.totalMatchdayRevenue) || 0;
  const costs = Number(props.club?.Finances?.totalMatchdayCosts) || 0;
  return rev - costs;
});

const matchHistory = computed(() => {
  return Array.isArray(props.club?.Finances?.history) ? props.club.Finances.history : [];
});

// Both moved by every result on the server (world/club-standing.service.ts).
const boardConfidence = computed(() => Number(props.club?.BoardConfidence ?? 60));

const fanApproval = computed(() => {
  const recent: string[] = (props.club?.Form?.recent ?? []).slice(0, 5);
  const form = recent.length
    ? (recent.filter((r) => r === 'W').length - recent.filter((r) => r === 'L').length) / 5
    : 0;
  return Math.min(99, Math.max(5, Math.round(55 + form * 30 + (boardConfidence.value - 60) * 0.3)));
});

const expectations = computed(() => {
  const recent: string[] = (props.club?.Form?.recent ?? []).slice(0, 5);
  const w = recent.filter((r) => r === 'W').length;
  const l = recent.filter((r) => r === 'L').length;
  const lastGate = matchHistory.value[0];
  return [
    {
      title: 'Keep the board on side',
      met: boardConfidence.value >= 35,
      status:
        boardConfidence.value >= 35
          ? `Confidence ${boardConfidence.value}%`
          : `Confidence ${boardConfidence.value}% - budget requests limited`,
    },
    {
      title: 'Win more than you lose',
      met: recent.length === 0 || w >= l,
      status: recent.length ? `Last ${recent.length}: ${recent.join(' ')}` : 'No matches yet',
    },
    {
      title: 'Matchdays turn a profit',
      met: !lastGate || Number(lastGate.net) >= 0,
      status: lastGate
        ? `Last gate: ${Number(lastGate.attendance).toLocaleString()} fans, net ${Math.round(Number(lastGate.net)).toLocaleString()}`
        : 'No home matches yet',
    },
  ];
});

function formatDate(date: string | Date | undefined): string {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString();
}
</script>

<style scoped>
.owner-zone {
  width: 100%;
}
.stat-card {
  border-radius: 10px;
}
</style>
