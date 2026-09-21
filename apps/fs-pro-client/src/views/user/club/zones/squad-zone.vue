<template>
  <div>
    <v-row>
      <v-col cols="12">
        <v-card class="pa-2">
          <v-card-title class="d-flex justify-space-between align-center">
            <span>Squad Management & Performance</span>
            <div class="d-flex align-center">
              <v-btn
                color="teal-darken-1"
                size="small"
                variant="elevated"
                class="mr-3 text-white"
                :loading="recruitingYouth"
                @click="recruitYouth"
              >
                <v-icon start size="small">mdi-school</v-icon>
                Promote Youth Player
              </v-btn>
              <span class="text-caption text-medium-emphasis">{{ players.length }} Players</span>
            </div>
          </v-card-title>

          <table
            style="
              border: solid 2px white;
              border-collapse: collapse;
              width: 100%;
            "
          >
            <thead>
              <tr>
                <th style="border: solid 1px white; padding: 6px 8px">
                  Player (POS)
                </th>
                <th style="border: solid 1px white; padding: 6px 8px">Age</th>
                <th style="border: solid 1px white; padding: 6px 8px">Condition</th>
                <th style="border: solid 1px white; padding: 6px 8px">Status</th>
                <th style="border: solid 1px white; padding: 6px 8px">Prev.</th>
                <th style="border: solid 1px white; padding: 6px 8px">Curr.</th>
                <th style="border: solid 1px white; padding: 6px 8px">
                  Training Focus
                </th>
                <th style="border: solid 1px white; padding: 6px 8px">
                  Market / Sale
                </th>
              </tr>
            </thead>

            <tbody>
              <tr
                v-for="(player, i) in players"
                :key="player.id ?? player._id ?? i"
              >
                <td>
                  <strong>{{ player.FirstName ?? '' }} {{ player.LastName ?? '' }}</strong>
                  <template v-if="player.Position">
                    ({{ player.Position }})
                  </template>
                  <v-chip
                    v-if="player.isYouth || (player.Age && player.Age <= 20)"
                    size="x-small"
                    color="teal"
                    variant="flat"
                    class="ml-1 text-white"
                  >
                    Youth
                  </v-chip>
                  <v-chip
                    v-if="player.Morale"
                    size="x-small"
                    :color="moraleChipColor(player.Morale)"
                    variant="tonal"
                    class="ml-1"
                  >
                    {{ player.Morale }}
                  </v-chip>
                </td>

                <td>
                  {{ player.Age ?? 'N/A' }}
                </td>

                <td style="min-width: 120px">
                  <div class="d-flex align-center">
                    <v-progress-linear
                      :model-value="player.Fitness ?? 100"
                      :color="(player.Fitness ?? 100) >= 80 ? 'success' : (player.Fitness ?? 100) >= 60 ? 'warning' : 'error'"
                      height="8"
                      rounded
                      class="mr-2"
                    ></v-progress-linear>
                    <span class="text-caption font-weight-bold">{{ Math.round(player.Fitness ?? 100) }}%</span>
                  </div>
                </td>

                <td>
                  <v-chip
                    v-if="player.Injury && player.Injury.daysRemaining > 0"
                    color="error"
                    size="x-small"
                  >
                    🏥 {{ player.Injury.type }} ({{ player.Injury.daysRemaining }}d)
                  </v-chip>
                  <v-chip v-else color="success" size="x-small" variant="tonal">
                    Fit
                  </v-chip>
                </td>

                <td>
                  <template v-if="player.latestRating">
                    {{ player.latestRating.old_rating ?? 'N/A' }}
                    |
                    {{ formatCurrency(player.latestRating.old_value) }}
                    VLA
                  </template>

                  <template v-else>N/A</template>
                </td>

                <td>
                  <template v-if="player.latestRating">
                    {{ formatCurrency(player.latestRating.rating) }}
                    |
                    {{ formatCurrency(player.latestRating.value) }}
                    VLA
                  </template>

                  <template v-else>N/A</template>
                </td>

                <td style="min-width: 220px">
                  <v-select
                    density="compact"
                    variant="underlined"
                    hide-details
                    color="indigo"
                    :items="trainingFocusOptions"
                    item-title="label"
                    item-value="value"
                    :model-value="player.TrainingFocus ?? null"
                    :loading="savingPlayerIds.has(player._id)"
                    :disabled="savingPlayerIds.has(player._id)"
                    @update:model-value="
                      (value: string | null) => setTrainingFocus(player, value)
                    "
                  ></v-select>

                  <div
                    v-if="player.latestRating?.trainingCategory"
                    class="text-caption text-medium-emphasis"
                  >
                    Last trained: {{ player.latestRating.trainingCategory }}
                    <v-chip
                      v-if="player.latestRating.breakout"
                      size="x-small"
                      color="amber"
                      class="ml-1"
                    >
                      breakout!
                    </v-chip>
                  </div>
                </td>

                <td style="min-width: 150px">
                  <div class="d-flex align-center">
                    <v-chip
                      v-if="player.isTransferListed"
                      size="small"
                      color="purple-darken-1"
                      variant="flat"
                      class="cursor-pointer font-weight-medium"
                      @click="openListDialog(player)"
                    >
                      <v-icon start size="x-small">mdi-tag</v-icon>
                      For Sale: {{ formatCurrency(player.AskingPrice ?? player.Value) }}
                    </v-chip>
                    <v-btn
                      v-else
                      size="x-small"
                      variant="tonal"
                      color="purple-darken-1"
                      @click="openListDialog(player)"
                    >
                      <v-icon start size="x-small">mdi-tag-plus</v-icon>
                      Put on Sale
                    </v-btn>
                  </div>
                </td>
              </tr>

              <tr v-if="players.length === 0">
                <td colspan="8" class="text-center pa-4">
                  No players available
                </td>
              </tr>
            </tbody>
          </table>
        </v-card>
      </v-col>
    </v-row>

    <!-- List Player Dialog -->
    <list-player-dialog
      v-model:show="showListDialog"
      :player="selectedPlayerForSale"
      :club-id="club?._id"
      @update-available="onPlayerListed"
    />

    <v-snackbar
      v-model="showSnackbar"
      :color="snackbarColor"
      timeout="4000"
      location="top"
    >
      {{ snackbarText }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue';
import { currency } from '@/helpers/misc';
import { client } from '@/services/api';
import ListPlayerDialog from '@/components/players/list-player-dialog.vue';

const props = defineProps<{
  club?: any | null;
}>();

const emit = defineEmits<{
  (e: 'update-available'): void;
}>();

const showListDialog = ref(false);
const selectedPlayerForSale = ref<any | null>(null);
const recruitingYouth = ref(false);
const showSnackbar = ref(false);
const snackbarText = ref('');
const snackbarColor = ref('success');

/** null = no explicit choice - the server auto-picks a Role-appropriate
 * default (see DEFAULT_TRAINING_CATEGORY_BY_ROLE, player-training.service.ts)
 * and every club gets the same size training bonus either way; picking one
 * here only steers WHICH attributes benefit. */
const trainingFocusOptions = [
  { label: 'Auto (based on role)', value: null },
  { label: 'Attacking', value: 'Attacking' },
  { label: 'Defending', value: 'Defending' },
  { label: 'Physical', value: 'Physical' },
  { label: 'Technical', value: 'Technical' },
];

const savingPlayerIds = reactive(new Set<string>());

const players = computed(() => {
  if (!Array.isArray(props.club?.Players)) {
    return [];
  }

  return props.club.Players.map((player: any) => {
    const history = Array.isArray(player?.RatingsHistory)
      ? player.RatingsHistory
      : [];

    return {
      ...player,
      latestRating: history.length > 0 ? history[history.length - 1] : null,
    };
  });
});

function openListDialog(player: any) {
  selectedPlayerForSale.value = player;
  showListDialog.value = true;
}

function onPlayerListed() {
  emit('update-available');
}

async function recruitYouth() {
  const clubId = props.club?._id;
  if (!clubId) return;

  recruitingYouth.value = true;
  try {
    const res = await client.clubs.recruitYouthPlayers.mutation({
      params: { id: clubId },
      body: { count: 1 },
    });

    if (res.status === 200 && res.body.payload?.length) {
      const p = res.body.payload[0];
      snackbarText.value = `🌟 Promoted ${p.FirstName} ${p.LastName} (${p.Position}, Age ${p.Age}) from the Academy!`;
      snackbarColor.value = 'teal-darken-2';
      showSnackbar.value = true;
      emit('update-available');
    } else {
      snackbarText.value = 'No youth recruits available right now.';
      snackbarColor.value = 'warning';
      showSnackbar.value = true;
    }
  } catch (error: any) {
    console.error('Error recruiting youth:', error);
    snackbarText.value = error?.message ?? 'Failed to scout youth prospect';
    snackbarColor.value = 'error';
    showSnackbar.value = true;
  } finally {
    recruitingYouth.value = false;
  }
}

function moraleChipColor(morale: string) {
  switch (morale) {
    case 'Very High':
    case 'High':
      return 'success';
    case 'Determined':
      return 'indigo';
    case 'Content':
      return 'teal';
    case 'Low':
    case 'Unhappy':
      return 'error';
    default:
      return 'grey';
  }
}

async function setTrainingFocus(player: any, value: string | null) {
  const playerId = player._id;
  if (!playerId) return;

  savingPlayerIds.add(playerId);
  try {
    await client.players.updatePlayer.mutation({
      params: { id: playerId },
      body: { TrainingFocus: value },
    });
    emit('update-available');
  } catch (error) {
    console.error('Error updating training focus:', error);
  } finally {
    savingPlayerIds.delete(playerId);
  }
}

function formatCurrency(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    typeof value !== 'number' ||
    Number.isNaN(value)
  ) {
    return 'N/A';
  }

  return currency(value);
}
</script>

<style scoped>
table {
  text-align: left;
}

table tr:nth-child(even) {
  color: black;
  background-color: #f2f2f2;
}

table td {
  border: solid 1px white;
  padding: 4px;
}
</style>
