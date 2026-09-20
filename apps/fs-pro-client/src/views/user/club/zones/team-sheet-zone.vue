<template>
  <div class="team-sheet-zone">
    <v-row>
      <!-- Pitch & Formation View -->
      <v-col cols="12" md="7">
        <v-card class="pa-3 elevation-4 pitch-card">
          <div class="d-flex justify-space-between align-center mb-2">
            <div class="d-flex align-center gap-2">
              <v-select
                v-model="selectedFormation"
                :items="formationOptions"
                label="Formation"
                density="compact"
                variant="outlined"
                hide-details
                :disabled="readOnly"
                style="max-width: 140px"
              ></v-select>

              <v-select
                v-model="selectedStyle"
                :items="styleOptions"
                label="Playing Style"
                density="compact"
                variant="outlined"
                hide-details
                :disabled="readOnly"
                style="max-width: 160px"
              ></v-select>
            </div>

            <div v-if="!readOnly" class="d-flex gap-2">
              <v-btn
                size="small"
                variant="tonal"
                color="amber-lighten-1"
                @click="autoPickSquad"
                title="Auto-select highest rated healthy players"
              >
                Auto-Pick
              </v-btn>
              <v-btn
                size="small"
                variant="flat"
                color="success"
                :loading="saving"
                @click="saveLineup"
              >
                Save Tactics
              </v-btn>
            </div>
            <div v-else class="d-flex align-center">
              <v-chip size="small" color="info" variant="tonal" prepend-icon="mdi-magnify-scan">
                Scouting Report (Read-Only)
              </v-chip>
            </div>
          </div>

          <!-- Swap status banner -->
          <v-alert
            v-if="swapCandidate"
            type="info"
            variant="tonal"
            density="compact"
            class="mb-2 py-1"
          >
            Selected <strong>{{ getPlayerName(swapCandidate) }}</strong>. Click another player to swap or click cancel.
            <v-btn size="x-small" variant="text" color="error" class="ml-2" @click="swapCandidate = null">
              Cancel
            </v-btn>
          </v-alert>

          <!-- Interactive 2D Football Pitch -->
          <div class="pitch-container">
            <div class="pitch-field">
              <!-- Center Circle & Halfway Line -->
              <div class="pitch-halfway-line"></div>
              <div class="pitch-center-circle"></div>
              <div class="pitch-center-spot"></div>

              <!-- Penalty Areas -->
              <div class="pitch-penalty-area top"></div>
              <div class="pitch-goal-area top"></div>
              <div class="pitch-penalty-area bottom"></div>
              <div class="pitch-goal-area bottom"></div>

              <!-- Starting XI Players positioned on pitch -->
              <div
                v-for="(slot, index) in pitchSlots"
                :key="index"
                class="pitch-player-slot"
                :style="{ top: `${slot.y * 100}%`, left: `${slot.x * 100}%` }"
                :class="{
                  selected: swapCandidate?.id === slot.player?._id,
                  empty: !slot.player,
                  injured: isInjured(slot.player),
                }"
                @click="handlePlayerClick(slot.player, 'starter', index)"
              >
                <div v-if="slot.player" class="player-badge">
                  <div class="player-pos-tag">{{ slot.label }}</div>
                  <div class="player-shirt">
                    <span class="shirt-num">{{ slot.player.ShirtNumber || (index + 1) }}</span>
                    <span
                      class="fitness-indicator"
                      :style="{ backgroundColor: getFitnessColor(slot.player.Fitness ?? 100) }"
                      :title="`Fitness: ${Math.round(slot.player.Fitness ?? 100)}%`"
                    ></span>
                  </div>
                  <div class="player-name">{{ slot.player.LastName || slot.player.FirstName }}</div>
                  <div class="player-ovr">{{ Math.round(slot.player.Rating ?? 60) }}</div>
                  <div v-if="isInjured(slot.player)" class="injury-badge" title="Injured">
                    🏥
                  </div>
                </div>
                <div v-else class="empty-slot">
                  <span class="slot-pos">{{ slot.label }}</span>
                  <span class="slot-text">+ Pick</span>
                </div>
              </div>
            </div>
          </div>
        </v-card>
      </v-col>

      <!-- Bench & Reserves Panel -->
      <v-col cols="12" md="5">
        <v-card class="pa-3 elevation-4 mb-3">
          <div class="text-subtitle-1 font-weight-bold d-flex justify-space-between align-center mb-2">
            <span>Substitutes (Bench {{ benchPlayers.length }}/7)</span>
            <v-chip size="x-small" color="primary">In Matchday Squad</v-chip>
          </div>

          <v-list density="compact" class="pa-0 bench-list">
            <v-list-item
              v-for="(player, idx) in benchPlayers"
              :key="player._id"
              class="bench-item mb-1 rounded"
              :class="{ selected: swapCandidate?.id === player._id }"
              @click="handlePlayerClick(player, 'bench', idx)"
            >
              <template #prepend>
                <v-avatar size="28" color="grey-darken-3" class="mr-2">
                  <span class="text-caption font-weight-bold">{{ player.ShirtNumber || idx + 12 }}</span>
                </v-avatar>
              </template>

              <v-list-item-title class="text-body-2 font-weight-medium">
                {{ player.FirstName }} {{ player.LastName }}
                <v-chip size="x-small" variant="tonal" class="ml-1" color="indigo">
                  {{ player.Position }}
                </v-chip>
                <v-chip
                  v-if="isInjured(player)"
                  size="x-small"
                  color="error"
                  class="ml-1"
                >
                  🏥 {{ player.Injury?.daysRemaining }}d
                </v-chip>
              </v-list-item-title>

              <template #append>
                <div class="d-flex align-center gap-2">
                  <v-progress-linear
                    :model-value="player.Fitness ?? 100"
                    :color="getFitnessColor(player.Fitness ?? 100)"
                    height="6"
                    rounded
                    style="width: 40px"
                  ></v-progress-linear>
                  <span class="font-weight-bold ml-2">{{ Math.round(player.Rating ?? 60) }}</span>
                </div>
              </template>
            </v-list-item>

            <div v-if="benchPlayers.length === 0" class="text-caption text-medium-emphasis py-2 text-center">
              No substitutes assigned. Click a player to add to bench.
            </div>
          </v-list>
        </v-card>

        <!-- Reserves Pool -->
        <v-card class="pa-3 elevation-4">
          <div class="text-subtitle-1 font-weight-bold mb-2">
            Reserves ({{ reservePlayers.length }})
          </div>

          <v-list density="compact" class="pa-0 reserves-list" style="max-height: 250px; overflow-y: auto;">
            <v-list-item
              v-for="player in reservePlayers"
              :key="player._id"
              class="reserve-item mb-1 rounded"
              :class="{ selected: swapCandidate?.id === player._id }"
              @click="handlePlayerClick(player, 'reserve')"
            >
              <template #prepend>
                <v-chip size="x-small" variant="outlined" class="mr-2" color="grey">
                  {{ player.Position }}
                </v-chip>
              </template>

              <v-list-item-title class="text-body-2">
                {{ player.FirstName }} {{ player.LastName }}
                <v-chip
                  v-if="isInjured(player)"
                  size="x-small"
                  color="error"
                  class="ml-1"
                >
                  🏥 {{ player.Injury?.daysRemaining }}d
                </v-chip>
              </v-list-item-title>

              <template #append>
                <div class="d-flex align-center gap-1">
                  <span class="text-caption text-medium-emphasis mr-2">Fit: {{ Math.round(player.Fitness ?? 100) }}%</span>
                  <span class="font-weight-bold">{{ Math.round(player.Rating ?? 60) }}</span>
                </div>
              </template>
            </v-list-item>

            <div v-if="reservePlayers.length === 0" class="text-caption text-medium-emphasis py-2 text-center">
              All players in starting squad or bench.
            </div>
          </v-list>
        </v-card>
      </v-col>
    </v-row>

    <!-- Save Snackbar Notification -->
    <v-snackbar v-model="snackbar" :timeout="3000" color="success" location="bottom right">
      {{ snackbarMessage }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { client } from '@/services/api';

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

const formationOptions = ['4-3-3', '4-4-2', '4-2-3-1', '3-5-2'];
// value = the match engine's PLAYING_STYLES key, title = what the user reads.
const styleOptions = [
  { title: 'Balanced', value: 'Balanced' },
  { title: 'High Press', value: 'HighPress' },
  { title: 'Low Block', value: 'LowBlock' },
  { title: 'Possession', value: 'Possession' },
  { title: 'Direct', value: 'Direct' },
];

/** Older saves stored the display label ('High Press'); map it to the key. */
function toStyleKey(saved: string): string {
  const squash = (v: string) => v.replace(/[\s_-]+/g, '').toLowerCase();
  return styleOptions.find((o) => squash(o.value) === squash(saved))?.value ?? 'Balanced';
}

const selectedFormation = ref('4-3-3');
const selectedStyle = ref('Balanced');
const saving = ref(false);
const snackbar = ref(false);
const snackbarMessage = ref('');

// Starting XI player IDs array (11 items)
const starterIds = ref<string[]>([]);
// Bench player IDs array (up to 7 items)
const benchIds = ref<string[]>([]);

// Player swap selection state
const swapCandidate = ref<{ id: string; source: 'starter' | 'bench' | 'reserve'; index?: number } | null>(null);

// Formation coordinates mapping (percentages: x=horizontal 5-95, y=vertical 5-95)
const FORMATION_ANCHORS: Record<string, { label: string; pos: string; x: number; y: number }[]> = {
  '4-3-3': [
    { label: 'GK', pos: 'GK', x: 0.5, y: 0.88 },
    { label: 'LB', pos: 'DEF', x: 0.15, y: 0.72 },
    { label: 'CB', pos: 'DEF', x: 0.38, y: 0.74 },
    { label: 'CB', pos: 'DEF', x: 0.62, y: 0.74 },
    { label: 'RB', pos: 'DEF', x: 0.85, y: 0.72 },
    { label: 'CM', pos: 'MID', x: 0.28, y: 0.50 },
    { label: 'CDM', pos: 'MID', x: 0.50, y: 0.55 },
    { label: 'CM', pos: 'MID', x: 0.72, y: 0.50 },
    { label: 'LW', pos: 'ATT', x: 0.18, y: 0.22 },
    { label: 'ST', pos: 'ATT', x: 0.50, y: 0.18 },
    { label: 'RW', pos: 'ATT', x: 0.82, y: 0.22 },
  ],
  '4-4-2': [
    { label: 'GK', pos: 'GK', x: 0.5, y: 0.88 },
    { label: 'LB', pos: 'DEF', x: 0.15, y: 0.72 },
    { label: 'CB', pos: 'DEF', x: 0.38, y: 0.74 },
    { label: 'CB', pos: 'DEF', x: 0.62, y: 0.74 },
    { label: 'RB', pos: 'DEF', x: 0.85, y: 0.72 },
    { label: 'LM', pos: 'MID', x: 0.15, y: 0.48 },
    { label: 'CM', pos: 'MID', x: 0.38, y: 0.50 },
    { label: 'CM', pos: 'MID', x: 0.62, y: 0.50 },
    { label: 'RM', pos: 'MID', x: 0.85, y: 0.48 },
    { label: 'ST', pos: 'ATT', x: 0.36, y: 0.20 },
    { label: 'ST', pos: 'ATT', x: 0.64, y: 0.20 },
  ],
  '4-2-3-1': [
    { label: 'GK', pos: 'GK', x: 0.5, y: 0.88 },
    { label: 'LB', pos: 'DEF', x: 0.15, y: 0.74 },
    { label: 'CB', pos: 'DEF', x: 0.38, y: 0.76 },
    { label: 'CB', pos: 'DEF', x: 0.62, y: 0.76 },
    { label: 'RB', pos: 'DEF', x: 0.85, y: 0.74 },
    { label: 'CDM', pos: 'MID', x: 0.35, y: 0.58 },
    { label: 'CDM', pos: 'MID', x: 0.65, y: 0.58 },
    { label: 'LAM', pos: 'MID', x: 0.20, y: 0.38 },
    { label: 'CAM', pos: 'MID', x: 0.50, y: 0.36 },
    { label: 'RAM', pos: 'MID', x: 0.80, y: 0.38 },
    { label: 'ST', pos: 'ATT', x: 0.50, y: 0.18 },
  ],
  '3-5-2': [
    { label: 'GK', pos: 'GK', x: 0.5, y: 0.88 },
    { label: 'CB', pos: 'DEF', x: 0.25, y: 0.74 },
    { label: 'CB', pos: 'DEF', x: 0.50, y: 0.76 },
    { label: 'CB', pos: 'DEF', x: 0.75, y: 0.74 },
    { label: 'LWB', pos: 'MID', x: 0.10, y: 0.48 },
    { label: 'CM', pos: 'MID', x: 0.32, y: 0.52 },
    { label: 'CAM', pos: 'MID', x: 0.50, y: 0.42 },
    { label: 'CM', pos: 'MID', x: 0.68, y: 0.52 },
    { label: 'RWB', pos: 'MID', x: 0.90, y: 0.48 },
    { label: 'ST', pos: 'ATT', x: 0.36, y: 0.20 },
    { label: 'ST', pos: 'ATT', x: 0.64, y: 0.20 },
  ],
};

const allClubPlayers = computed(() => {
  return Array.isArray(props.club?.Players) ? props.club.Players : [];
});

const pitchSlots = computed(() => {
  const anchors = FORMATION_ANCHORS[selectedFormation.value] || FORMATION_ANCHORS['4-3-3'];
  return anchors.map((anchor, idx) => {
    const pId = starterIds.value[idx];
    const player = allClubPlayers.value.find((p: any) => String(p._id) === pId);
    return {
      ...anchor,
      player,
    };
  });
});

const benchPlayers = computed(() => {
  return benchIds.value
    .map((id) => allClubPlayers.value.find((p: any) => String(p._id) === id))
    .filter(Boolean);
});

const reservePlayers = computed(() => {
  const selected = new Set([...starterIds.value, ...benchIds.value]);
  return allClubPlayers.value.filter((p: any) => !selected.has(String(p._id)));
});

// Initialize from club saved data
watch(
  () => props.club,
  (c) => {
    if (!c) return;

    if (c.Tactic?.formationName) {
      // Map '433' -> '4-3-3'
      const f = c.Tactic.formationName;
      if (f === '433') selectedFormation.value = '4-3-3';
      else if (f === '442') selectedFormation.value = '4-4-2';
      else if (f === '4231') selectedFormation.value = '4-2-3-1';
      else if (f === '352') selectedFormation.value = '3-5-2';
    }
    if (c.Tactic?.styleName) {
      selectedStyle.value = toStyleKey(c.Tactic.styleName);
    }

    if (c.Lineup?.startingXI?.length) {
      starterIds.value = [...c.Lineup.startingXI];
      benchIds.value = Array.isArray(c.Lineup.bench) ? [...c.Lineup.bench] : [];
    } else {
      autoPickSquad();
    }
  },
  { immediate: true }
);

function isInjured(player: any): boolean {
  return Boolean(player?.Injury && Number(player.Injury.daysRemaining) > 0);
}

function getFitnessColor(fitness: number): string {
  if (fitness >= 80) return '#4caf50';
  if (fitness >= 60) return '#fb8c00';
  return '#e53935';
}

function getPlayerName(candidate: { id: string }): string {
  const p = allClubPlayers.value.find((pl: any) => String(pl._id) === candidate.id);
  return p ? `${p.FirstName} ${p.LastName}` : 'Player';
}

function autoPickSquad() {
  const healthy = [...allClubPlayers.value]
    .filter((p: any) => !isInjured(p))
    .sort((a: any, b: any) => (b.Rating ?? 60) - (a.Rating ?? 60));

  const chosenStarters: string[] = [];
  const chosenBench: string[] = [];
  const used = new Set<string>();

  const anchors = FORMATION_ANCHORS[selectedFormation.value] || FORMATION_ANCHORS['4-3-3'];

  // Fill starters for each slot
  for (const slot of anchors) {
    const cand = healthy.find((p: any) => p.Position === slot.pos && !used.has(String(p._id)));
    if (cand) {
      chosenStarters.push(String(cand._id));
      used.add(String(cand._id));
    } else {
      // Fallback
      const anyCand = healthy.find((p: any) => !used.has(String(p._id)));
      if (anyCand) {
        chosenStarters.push(String(anyCand._id));
        used.add(String(anyCand._id));
      }
    }
  }

  // Fill bench (up to 7)
  for (const p of healthy) {
    if (chosenBench.length >= 7) break;
    if (!used.has(String(p._id))) {
      chosenBench.push(String(p._id));
      used.add(String(p._id));
    }
  }

  starterIds.value = chosenStarters;
  benchIds.value = chosenBench;
}

function handlePlayerClick(
  player: any,
  source: 'starter' | 'bench' | 'reserve',
  index?: number
) {
  if (props.readOnly) return;

  if (!player && source === 'starter' && swapCandidate.value) {
    // Fill empty starter slot with swapCandidate
    const candId = swapCandidate.value.id;
    if (swapCandidate.value.source === 'starter' && swapCandidate.value.index !== undefined) {
      starterIds.value[swapCandidate.value.index] = '';
    } else if (swapCandidate.value.source === 'bench') {
      benchIds.value = benchIds.value.filter((id) => id !== candId);
    }
    if (index !== undefined) {
      starterIds.value[index] = candId;
    }
    swapCandidate.value = null;
    return;
  }

  if (!player) return;

  const clickedId = String(player._id);

  if (!swapCandidate.value) {
    // Select first player
    swapCandidate.value = { id: clickedId, source, index };
    return;
  }

  // Swap candidate with clicked player
  const first = swapCandidate.value;
  if (first.id === clickedId) {
    // Deselect
    swapCandidate.value = null;
    return;
  }

  // Perform swap between first and clicked player
  if (first.source === 'starter' && source === 'starter') {
    // Swap two starters
    if (first.index !== undefined && index !== undefined) {
      const temp = starterIds.value[first.index];
      starterIds.value[first.index] = starterIds.value[index];
      starterIds.value[index] = temp;
    }
  } else if (first.source === 'starter' && source === 'bench') {
    // Swap starter and bench
    if (first.index !== undefined && index !== undefined) {
      starterIds.value[first.index] = clickedId;
      benchIds.value[index] = first.id;
    }
  } else if (first.source === 'bench' && source === 'starter') {
    // Swap bench and starter
    if (index !== undefined && first.index !== undefined) {
      starterIds.value[index] = first.id;
      benchIds.value[first.index] = clickedId;
    }
  } else if (first.source === 'starter' && source === 'reserve') {
    // Swap starter and reserve
    if (first.index !== undefined) {
      starterIds.value[first.index] = clickedId;
    }
  } else if (first.source === 'reserve' && source === 'starter') {
    // Swap reserve and starter
    if (index !== undefined) {
      starterIds.value[index] = first.id;
    }
  } else if (first.source === 'bench' && source === 'reserve') {
    // Swap bench and reserve
    if (first.index !== undefined) {
      benchIds.value[first.index] = clickedId;
    }
  } else if (first.source === 'reserve' && source === 'bench') {
    // Swap reserve and bench
    if (index !== undefined) {
      benchIds.value[index] = first.id;
    }
  }

  swapCandidate.value = null;
}

async function saveLineup() {
  if (!props.club?._id) return;

  saving.value = true;
  try {
    const rawFormation = selectedFormation.value.replace(/-/g, ''); // '4-3-3' -> '433'

    const response = await client.clubs.updateClub.mutation({
      params: { id: props.club._id },
      body: {
        Lineup: {
          startingXI: starterIds.value.filter(Boolean),
          bench: benchIds.value.filter(Boolean),
        },
        Tactic: {
          formationName: rawFormation,
          styleName: selectedStyle.value,
        },
      },
    });

    if (response.status !== 200) {
      snackbarMessage.value = `Error saving team sheet: ${response.body.message}`;
      snackbar.value = true;
      return;
    }

    snackbarMessage.value = 'Team sheet and tactics saved!';
    snackbar.value = true;
    emit('update-available');
  } catch (error) {
    console.error('Failed to save lineup:', error);
    snackbarMessage.value = 'Error saving team sheet.';
    snackbar.value = true;
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.team-sheet-zone {
  width: 100%;
}

.pitch-card {
  background: #1e293b;
  border-radius: 12px;
}

.pitch-container {
  position: relative;
  width: 100%;
  padding-top: 130%; /* Aspect ratio of football pitch */
  background: #1b5e20;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.6);
  border: 3px solid rgba(255, 255, 255, 0.4);
}

.pitch-field {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    #2e7d32,
    #2e7d32 40px,
    #388e3c 40px,
    #388e3c 80px
  );
}

.pitch-halfway-line {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 2px;
  background: rgba(255, 255, 255, 0.6);
}

.pitch-center-circle {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100px;
  height: 100px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.6);
}

.pitch-center-spot {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 6px;
  height: 6px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 50%;
}

.pitch-penalty-area {
  position: absolute;
  left: 25%;
  width: 50%;
  height: 16%;
  border: 2px solid rgba(255, 255, 255, 0.6);
}
.pitch-penalty-area.top {
  top: 0;
  border-top: none;
}
.pitch-penalty-area.bottom {
  bottom: 0;
  border-bottom: none;
}

.pitch-goal-area {
  position: absolute;
  left: 36%;
  width: 28%;
  height: 7%;
  border: 2px solid rgba(255, 255, 255, 0.6);
}
.pitch-goal-area.top {
  top: 0;
  border-top: none;
}
.pitch-goal-area.bottom {
  bottom: 0;
  border-bottom: none;
}

.pitch-player-slot {
  position: absolute;
  transform: translate(-50%, -50%);
  cursor: pointer;
  transition: transform 0.2s, filter 0.2s;
  z-index: 5;
}
.pitch-player-slot:hover {
  transform: translate(-50%, -50%) scale(1.1);
}
.pitch-player-slot.selected {
  outline: 3px solid #ffeb3b;
  border-radius: 8px;
  transform: translate(-50%, -50%) scale(1.15);
  box-shadow: 0 0 15px #ffeb3b;
}

.player-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 65px;
  text-align: center;
}

.player-pos-tag {
  font-size: 9px;
  font-weight: bold;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  padding: 1px 4px;
  border-radius: 3px;
  margin-bottom: 2px;
}

.player-shirt {
  position: relative;
  width: 32px;
  height: 32px;
  background: #d32f2f;
  border: 2px solid white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}

.shirt-num {
  font-size: 13px;
  font-weight: 900;
  color: white;
}

.fitness-indicator {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid white;
}

.player-name {
  font-size: 10px;
  font-weight: bold;
  color: white;
  text-shadow: 1px 1px 2px black;
  max-width: 65px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}

.player-ovr {
  font-size: 10px;
  font-weight: bold;
  background: #ffc107;
  color: black;
  padding: 0 4px;
  border-radius: 3px;
}

.injury-badge {
  position: absolute;
  top: -4px;
  right: 0px;
  font-size: 12px;
}

.empty-slot {
  width: 50px;
  height: 50px;
  border: 2px dashed rgba(255, 255, 255, 0.5);
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  color: white;
  font-size: 10px;
}

.bench-item,
.reserve-item {
  cursor: pointer;
  background: rgba(255, 255, 255, 0.05);
  transition: background 0.2s;
}
.bench-item:hover,
.reserve-item:hover {
  background: rgba(255, 255, 255, 0.12);
}
.bench-item.selected,
.reserve-item.selected {
  outline: 2px solid #ffeb3b;
  background: rgba(255, 235, 59, 0.15);
}
</style>
