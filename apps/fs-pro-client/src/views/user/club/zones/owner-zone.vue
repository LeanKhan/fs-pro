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
        <v-card class="pa-4 elevation-3 mb-4">
          <div class="text-h6 font-weight-bold d-flex justify-space-between align-center mb-3">
            <span>Stadium & Infrastructure</span>
            <v-chip color="primary" size="small">{{ stadiumName }}</v-chip>
          </div>

          <v-row class="mt-1">
            <v-col cols="6">
              <div class="text-caption text-medium-emphasis">Current Capacity</div>
              <div class="text-h6 font-weight-bold">{{ stadiumCapacity.toLocaleString() }} seats</div>
            </v-col>
            <v-col cols="6">
              <div class="text-caption text-medium-emphasis">Location</div>
              <div class="text-body-1">{{ stadiumLocation }}</div>
            </v-col>
          </v-row>

          <v-divider class="my-4"></v-divider>

          <div v-if="!readOnly">
            <div class="text-subtitle-2 font-weight-bold mb-2">Stadium Expansion Project</div>
            <p class="text-body-2 text-medium-emphasis mb-3">
              Add 5,000 additional seats to increase matchday ticket capacity.
              Construction cost: <strong>€2,500,000</strong>.
            </p>

            <v-btn
              color="indigo"
              variant="flat"
              :disabled="(club?.Budget ?? 0) < 2500000 || expanding"
              :loading="expanding"
              @click="expandStadium"
            >
              Expand Capacity (+5,000 Seats)
            </v-btn>
          </div>
          <div v-else class="pa-2 rounded border" style="background: rgba(255, 255, 255, 0.03)">
            <div class="text-caption text-medium-emphasis">
              <v-icon size="small" class="mr-1">mdi-eye-outline</v-icon>
              Viewing autonomous club infrastructure & public matchday venue.
            </div>
          </div>

          <v-divider class="my-4"></v-divider>

          <div class="text-subtitle-2 font-weight-bold mb-2">Facility Upgrades</div>
          <v-row>
            <v-col cols="6">
              <v-card variant="outlined" class="pa-3">
                <div class="font-weight-bold text-body-2">Training Grounds</div>
                <div class="text-caption text-medium-emphasis">Improves player fitness recovery (+15%)</div>
                <v-chip size="x-small" color="success" class="mt-2">Level 3 / 5</v-chip>
              </v-card>
            </v-col>
            <v-col cols="6">
              <v-card variant="outlined" class="pa-3">
                <div class="font-weight-bold text-body-2">Youth Academy</div>
                <div class="text-caption text-medium-emphasis">Attracts higher potential youth prospects</div>
                <v-chip size="x-small" color="primary" class="mt-2">Level 2 / 5</v-chip>
              </v-card>
            </v-col>
          </v-row>
        </v-card>

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
                color="success"
                height="10"
                rounded
                class="mt-1"
              ></v-progress-linear>
              <span class="text-caption font-weight-bold">{{ boardConfidence }}%</span>
            </v-col>
            <v-col cols="6">
              <div class="text-caption text-medium-emphasis">Fan Approval</div>
              <v-progress-linear
                :model-value="82"
                color="info"
                height="10"
                rounded
                class="mt-1"
              ></v-progress-linear>
              <span class="text-caption font-weight-bold">82%</span>
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
          <div class="text-h6 font-weight-bold mb-3">Season Expectations</div>
          <v-list density="compact" class="pa-0">
            <v-list-item class="px-0">
              <template #prepend>
                <v-icon color="success" class="mr-2">mdi-check-circle-outline</v-icon>
              </template>
              <v-list-item-title class="text-body-2">Finish in top half of the table</v-list-item-title>
              <v-list-item-subtitle class="text-caption">Current standing: On track</v-list-item-subtitle>
            </v-list-item>

            <v-list-item class="px-0">
              <template #prepend>
                <v-icon color="warning" class="mr-2">mdi-clock-outline</v-icon>
              </template>
              <v-list-item-title class="text-body-2">Maintain positive operating cash flow</v-list-item-title>
              <v-list-item-subtitle class="text-caption">Budget healthy</v-list-item-subtitle>
            </v-list-item>

            <v-list-item class="px-0">
              <template #prepend>
                <v-icon color="info" class="mr-2">mdi-school-outline</v-icon>
              </template>
              <v-list-item-title class="text-body-2">Promote at least 1 youth prospect</v-list-item-title>
              <v-list-item-subtitle class="text-caption">Academy active</v-list-item-subtitle>
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
import { client } from '@/services/api';
import { ManagerPicker, ManagerFirer } from '@/components/clubzone';

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

const expanding = ref(false);
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

const stadiumName = computed(() => {
  return props.club?.Stadium?.Name || 'Municipal Stadium';
});

const stadiumCapacity = computed(() => {
  return Number(props.club?.Stadium?.Capacity) || 20000;
});

const stadiumLocation = computed(() => {
  return props.club?.Stadium?.Location || props.club?.Address?.City || 'Home Grounds';
});

const matchHistory = computed(() => {
  return Array.isArray(props.club?.Finances?.history) ? props.club.Finances.history : [];
});

const boardConfidence = computed(() => {
  const won = Number(props.club?.Stats?.MatchesWon) || 0;
  const played = won + (Number(props.club?.Stats?.MatchesLost) || 0) + (Number(props.club?.Stats?.MatchesDrawn) || 0);
  if (played === 0) return 75;
  const winRate = (won / played) * 100;
  return Math.min(99, Math.max(25, Math.round(50 + winRate / 2)));
});

function formatDate(date: string | Date | undefined): string {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString();
}

async function expandStadium() {
  if (!props.club?._id) return;
  expanding.value = true;

  try {
    const newCapacity = stadiumCapacity.value + 5000;
    const newBudget = (props.club.Budget ?? 0) - 2500000;

    const response = await client.clubs.updateClub.mutation({
      params: { id: props.club._id },
      body: {
        Budget: newBudget,
        Stadium: {
          ...(props.club.Stadium || {}),
          Capacity: newCapacity,
        },
      },
    });

    if (response.status !== 200) {
      snackbarText.value = `Error completing stadium expansion: ${response.body.message}`;
      snackbar.value = true;
      return;
    }

    snackbarText.value = 'Stadium expansion completed! +5,000 seats added.';
    snackbar.value = true;
    emit('update-available');
  } catch (err) {
    console.error('Failed to expand stadium:', err);
    snackbarText.value = 'Error completing stadium expansion.';
    snackbar.value = true;
  } finally {
    expanding.value = false;
  }
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
