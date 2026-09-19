<template>
  <div>
    <v-row>
      <v-col cols="12">
        <v-card class="pa-2">
          <v-card-title class="d-flex justify-space-between align-center">
            <span>Squad Management & Performance</span>
            <span class="text-caption text-medium-emphasis">{{ players.length }} Players</span>
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
              </tr>

              <tr v-if="players.length === 0">
                <td colspan="7" class="text-center pa-4">
                  No players available
                </td>
              </tr>
            </tbody>
          </table>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { currency } from '@/helpers/misc';
import { client } from '@/services/api';

const props = defineProps<{
  club?: any | null;
}>();

const emit = defineEmits<{
  (e: 'update-available'): void;
}>();

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
