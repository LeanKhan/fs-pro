<template>
  <div>
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-toolbar flat color="indigo-darken-1">
            <v-btn icon @click="goBack">
              <v-icon>mdi-arrow-left</v-icon>
            </v-btn>
            <v-toolbar-title class="ml-1">Player</v-toolbar-title>
            <v-spacer></v-spacer>

            <v-btn
              icon
              color="white"
              :to="{ name: 'Update Player', params: route.params }"
            >
              <v-icon>mdi-pencil-outline</v-icon>
            </v-btn>
            <v-btn icon color="white" @click="fetchPlayer">
              <v-icon>mdi-reload</v-icon>
            </v-btn>
          </v-toolbar>
        </v-card>
      </v-col>
    </v-row>

    <v-progress-linear v-if="loading" indeterminate color="indigo" />

    <template v-else-if="player._id">
      <v-row>
        <v-col cols="12">
          <v-card>
            <v-row no-gutters>
              <v-col cols="2" class="pa-3 d-flex justify-center">
                <player-avatar :player-id="playerId"></player-avatar>
              </v-col>

              <v-col cols="6">
                <v-card-text>
                  <div class="text-h5">
                    {{ player.FirstName }} {{ player.LastName }}
                    <span class="text-subtitle-1 text-grey">
                      {{ player.PlayerID }}
                    </span>
                  </div>

                  <div class="text-body-1 mt-2">
                    <span class="text-grey">Position:</span>
                    {{ player.Position }}
                    <span class="text-grey ml-3">Role:</span>
                    {{ player.Role }}
                    <span class="text-grey ml-3">Age:</span>
                    {{ player.Age }}
                  </div>

                  <div class="text-body-1">
                    <span class="text-grey">Club:</span>
                    {{ player.ClubCode ?? 'Free Agent' }}
                  </div>

                  <div class="text-body-1">
                    <v-chip
                      size="small"
                      :color="player.isSigned ? 'green' : 'orange'"
                      class="mr-2"
                    >
                      {{ player.isSigned ? 'Signed' : 'Unsigned' }}
                    </v-chip>
                    <v-chip v-if="player.isRetired" size="small" color="grey">
                      Retired
                    </v-chip>
                  </div>

                  <div class="text-body-1 mt-2">
                    <span class="text-grey">Training Focus:</span>
                    {{ player.TrainingFocus ?? 'Auto (based on role)' }}
                    <span
                      v-if="latestRating?.trainingCategory"
                      class="text-caption text-medium-emphasis ml-2"
                    >
                      (last trained: {{ latestRating.trainingCategory }}
                      <v-chip
                        v-if="latestRating.breakout"
                        size="x-small"
                        color="amber"
                        class="ml-1"
                      >
                        breakout!
                      </v-chip>
                      )
                    </span>
                  </div>
                </v-card-text>
              </v-col>

              <v-col cols="4">
                <v-card-text>
                  <div class="text-h6">
                    <span class="text-subtitle-1 text-grey">Rating:</span>
                    <v-rating
                      :model-value="ratingStars"
                      half-increments
                      readonly
                      density="compact"
                      color="amber-darken-1"
                      bg-color="secondary-lighten-1"
                    ></v-rating>
                    <span class="font-italic text-success">
                      {{ Math.round(player.Rating ?? 0) }}
                    </span>
                  </div>

                  <div class="text-body-1">
                    <span class="text-grey">Value:</span>
                    {{ currency(player.Value ?? 0) }}
                  </div>

                  <div class="text-body-1">
                    <span class="text-grey">Wage:</span>
                    {{ currency(player.Wage ?? 0) }} / yr
                  </div>
                </v-card-text>
              </v-col>
            </v-row>
          </v-card>
        </v-col>
      </v-row>

      <v-row>
        <v-col cols="12">
          <v-card>
            <v-card-title>Attributes</v-card-title>
            <v-card-text>
              <v-row dense>
                <v-col
                  v-for="attr in attributeEntries"
                  :key="attr.name"
                  cols="6"
                  sm="4"
                  md="3"
                  lg="2"
                >
                  <v-list-item density="compact">
                    <template v-slot:prepend>
                      <v-avatar size="42" :color="attrColor(attr.value)">
                        {{ attr.value }}
                      </v-avatar>
                    </template>
                    <v-list-item-title class="pl-2">
                      {{ attr.name }}
                    </v-list-item-title>
                  </v-list-item>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <v-row>
        <v-col cols="12">
          <v-card>
            <v-card-title>Ratings History</v-card-title>

            <v-table v-if="ratingsHistory.length" density="compact">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Rating</th>
                  <th>Value</th>
                  <th>Training</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(entry, i) in ratingsHistory"
                  :key="entry.year ?? i"
                >
                  <td>{{ entry.year ?? 'N/A' }}</td>
                  <td>
                    {{ entry.old_rating ?? '?' }} &rarr;
                    {{ entry.rating ?? '?' }}
                  </td>
                  <td>
                    {{ currency(entry.old_value) }} &rarr;
                    {{ currency(entry.value) }}
                  </td>
                  <td>
                    {{ entry.trainingCategory ?? 'N/A' }}
                    <v-chip
                      v-if="entry.breakout"
                      size="x-small"
                      color="amber"
                      class="ml-1"
                    >
                      breakout!
                    </v-chip>
                  </td>
                </tr>
              </tbody>
            </v-table>

            <v-sheet v-else class="text-center pa-4 text-grey">
              No ratings history yet - accrues at the end of each game Year.
            </v-sheet>
          </v-card>
        </v-col>
      </v-row>
    </template>

    <v-alert v-else type="error" variant="tonal" class="ma-4">
      Player not found.
    </v-alert>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useStore } from '@/store';
import { client } from '@/services/api';
import PlayerAvatar from '@/components/players/player-avatar.vue';
import { currency } from '@/helpers/misc';

const router = useRouter();
const route = useRoute();
const store = useStore();

const player = ref<any>({});
const loading = ref(false);

const playerId = computed(() => String(route.params.id));

// Real attribute names on IPlayerAttributes/PlayerAttributesSchema - see
// schemas/player.ts's comment: real stored data uses `Setpiece` (lowercase
// p), not `SetPiece`, on ~54% of rows, so both keys are checked.
const ATTRIBUTE_NAMES = [
  'Speed',
  'Shooting',
  'LongPass',
  'ShortPass',
  'Mental',
  'Control',
  'Tackling',
  'Strength',
  'Stamina',
  'Keeping',
  'SetPiece',
  'Dribbling',
  'Vision',
  'ShotPower',
  'Aggression',
  'Interception',
  'Marking',
  'Agility',
  'Crossing',
  'Positioning',
  'LongShot',
];

const attributeEntries = computed(() => {
  const attrs = player.value.Attributes ?? {};
  return ATTRIBUTE_NAMES.map((name) => ({
    name,
    value: Math.round(attrs[name] ?? attrs[name.replace('SetPiece', 'Setpiece')] ?? 0),
  }));
});

const ratingsHistory = computed(() => {
  return Array.isArray(player.value.RatingsHistory)
    ? [...player.value.RatingsHistory].reverse()
    : [];
});

const latestRating = computed(() => ratingsHistory.value[0] ?? null);

const ratingStars = computed(() => {
  const rating = player.value.Rating ?? 0;
  return Math.round(rating) / 20;
});

function attrColor(value: number): string {
  if (value <= 50) return 'red';
  if (value < 80) return 'orange';
  return 'green';
}

function goBack() {
  router.back();
}

async function fetchPlayer() {
  loading.value = true;
  try {
    const response = await client.players.getPlayer.query({
      params: { id: playerId.value },
    });
    if (response.status === 200) {
      player.value = response.body.payload;
    } else {
      player.value = {};
    }
  } catch (error) {
    console.error('Error fetching player:', error);
    store.toggleErrorOverlay();
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchPlayer();
});
</script>
