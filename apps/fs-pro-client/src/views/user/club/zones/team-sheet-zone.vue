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
                variant="tonal"
                color="deep-purple-lighten-2"
                prepend-icon="mdi-creation"
                :loading="suggesting"
                @click="askForSuggestion"
                title="Ask Jev to suggest positions for your players"
              >
                Suggest
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

          <!-- Lineup problems: shape vs formation, out-of-position, injured -->
          <v-alert
            v-if="lineupIssues.length && !readOnly"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-2 py-1 text-caption"
          >
            <div v-for="(issue, i) in lineupIssues" :key="i">{{ issue }}</div>
          </v-alert>

          <!-- Suggestion from Jev (or the local standby) -->
          <v-alert
            v-if="suggestion"
            type="info"
            variant="tonal"
            density="compact"
            class="mb-2"
            closable
            @click:close="suggestion = null"
          >
            <div class="d-flex align-center gap-2 mb-1">
              <strong>Suggested lineup</strong>
              <v-chip size="x-small" :color="suggestion.source === 'jev' ? 'deep-purple' : 'grey'" variant="flat">
                {{ suggestion.source === 'jev' ? 'Jev' : 'Local standby' }}
              </v-chip>
            </div>
            <div class="text-caption mb-1">{{ suggestion.reasoning }}</div>
            <div v-if="suggestion.excludedInjured.length" class="text-caption mb-1">
              Left out (injured): {{ suggestion.excludedInjured.join(', ') }}
            </div>
            <v-btn size="x-small" color="primary" variant="flat" @click="applySuggestion">Apply to pitch</v-btn>
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
                  inspecting: selectedPlayer?._id === slot.player?._id && swapCandidate?.id !== slot.player?._id,
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
                  <div
                    class="player-natural"
                    :class="{ mismatch: slot.player.Position !== slot.pos }"
                    :title="slot.player.Position !== slot.pos
                      ? `Natural ${slot.player.Position}, playing ${slot.pos}`
                      : `Natural ${slot.player.Position}`"
                  >
                    {{ slot.player.Position }}<span v-if="slot.player.Position !== slot.pos"> ⚠</span>
                  </div>
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

      <!-- Right Side Column: Squad & Player Details Panel -->
      <v-col cols="12" md="5">
        <!-- Navigation Tab Header -->
        <v-card class="pa-1 elevation-4 mb-3" color="#1e293b">
          <v-tabs
            v-model="rightPanelTab"
            density="compact"
            color="primary"
            grow
          >
            <v-tab value="squad">
              <v-icon start size="16">mdi-account-group</v-icon>
              Squad ({{ benchPlayers.length }}/7)
            </v-tab>
            <v-tab value="details" :disabled="!selectedPlayer">
              <v-icon start size="16">mdi-account-details</v-icon>
              Player Details
              <span v-if="selectedPlayer" class="ml-1 text-caption font-weight-bold text-amber-lighten-2">
                ({{ selectedPlayer.LastName || selectedPlayer.FirstName }})
              </span>
            </v-tab>
          </v-tabs>
        </v-card>

        <!-- Tab 1: Squad (Bench & Reserves) -->
        <div v-show="rightPanelTab === 'squad'">
          <v-card class="pa-3 elevation-4 mb-3">
            <div class="text-subtitle-1 font-weight-bold d-flex justify-space-between align-center mb-2">
              <span>Substitutes (Bench {{ benchPlayers.length }}/7)</span>
              <v-chip size="x-small" color="primary">In Matchday Squad</v-chip>
            </div>

            <v-list density="compact" class="pa-0 bench-list">
              <v-list-item
                v-for="(player, idx) in benchPlayers"
                :key="player._id"
                class="bench-item mb-1 rounded cursor-pointer"
                :class="{
                  selected: swapCandidate?.id === player._id,
                  inspecting: selectedPlayer?._id === player._id && swapCandidate?.id !== player._id,
                }"
                @click="handlePlayerClick(player, 'bench', idx)"
              >
                <template #prepend>
                  <v-avatar size="28" color="grey-darken-3" class="mr-2">
                    <span class="text-caption font-weight-bold">{{ player.ShirtNumber || idx + 12 }}</span>
                  </v-avatar>
                </template>

                <v-list-item-title class="text-body-2 font-weight-medium">
                  {{ player.FirstName }} {{ player.LastName }}
                  <v-chip size="x-small" variant="tonal" class="ml-1" :color="getPositionColor(player.Position)">
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
                  <div class="d-flex align-center gap-1">
                    <v-progress-linear
                      :model-value="player.Fitness ?? 100"
                      :color="getFitnessColor(player.Fitness ?? 100)"
                      height="6"
                      rounded
                      style="width: 36px"
                    ></v-progress-linear>
                    <span class="font-weight-bold ml-1 mr-1">{{ Math.round(player.Rating ?? 60) }}</span>
                    <v-btn
                      v-if="!readOnly"
                      icon="mdi-close"
                      size="x-small"
                      variant="text"
                      color="grey"
                      density="compact"
                      @click.stop="removeBenchPlayer(idx)"
                      title="Move to Reserves"
                    />
                  </div>
                </template>
              </v-list-item>

              <!-- Empty Bench Slot Placeholders (Click to assign selected player) -->
              <v-list-item
                v-for="n in emptyBenchSlotsCount"
                :key="`empty-bench-${n}`"
                class="empty-bench-slot mb-1 rounded border border-dashed cursor-pointer"
                @click="handleEmptyBenchSlotClick(benchPlayers.length + n - 1)"
              >
                <template #prepend>
                  <v-avatar size="26" color="grey-darken-4" class="mr-2 border border-dashed">
                    <v-icon size="14" color="grey">mdi-plus</v-icon>
                  </v-avatar>
                </template>
                <v-list-item-title class="text-caption text-disabled font-italic">
                  {{ swapCandidate ? 'Click to assign ' + getPlayerName(swapCandidate) : 'Empty Bench Slot (Click to add player)' }}
                </v-list-item-title>
              </v-list-item>
            </v-list>
          </v-card>

          <!-- Reserves Pool -->
          <v-card class="pa-3 elevation-4">
            <div class="text-subtitle-1 font-weight-bold d-flex justify-space-between align-center mb-2">
              <span>Reserves ({{ reservePlayers.length }})</span>
              <span class="text-caption text-disabled">Click player to view details or swap</span>
            </div>

            <v-list density="compact" class="pa-0 reserves-list" style="max-height: 250px; overflow-y: auto;">
              <v-list-item
                v-for="player in reservePlayers"
                :key="player._id"
                class="reserve-item mb-1 rounded cursor-pointer"
                :class="{
                  selected: swapCandidate?.id === player._id,
                  inspecting: selectedPlayer?._id === player._id && swapCandidate?.id !== player._id,
                }"
                @click="handlePlayerClick(player, 'reserve')"
              >
                <template #prepend>
                  <v-chip size="x-small" variant="outlined" class="mr-2" :color="getPositionColor(player.Position)">
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
                    <span class="font-weight-bold mr-2">{{ Math.round(player.Rating ?? 60) }}</span>
                    <v-btn
                      v-if="!readOnly"
                      size="x-small"
                      variant="tonal"
                      color="primary"
                      density="comfortable"
                      class="font-weight-bold"
                      @click.stop="moveReserveToBench(player)"
                      title="Move player to bench"
                    >
                      + Bench
                    </v-btn>
                  </div>
                </template>
              </v-list-item>

              <div v-if="reservePlayers.length === 0" class="text-caption text-medium-emphasis py-2 text-center">
                All players in starting squad or bench.
              </div>
            </v-list>
          </v-card>
        </div>

        <!-- Tab 2: Player Details Side Panel -->
        <div v-if="selectedPlayer" v-show="rightPanelTab === 'details'">
          <v-card class="pa-3 elevation-4 mb-3 player-details-card">
            <!-- Header bar with Navigation and Close -->
            <div class="d-flex justify-space-between align-center pb-2 mb-2 border-b border-opacity-25">
              <div class="d-flex align-center gap-1">
                <v-btn
                  icon="mdi-chevron-left"
                  size="x-small"
                  variant="text"
                  @click="navigatePlayer('prev')"
                  title="Previous Player"
                />
                <v-btn
                  icon="mdi-chevron-right"
                  size="x-small"
                  variant="text"
                  @click="navigatePlayer('next')"
                  title="Next Player"
                />
                <span class="text-caption text-medium-emphasis ml-1">
                  {{ allClubPlayers.findIndex((p: any) => p._id === selectedPlayer._id) + 1 }} of {{ allClubPlayers.length }}
                </span>
              </div>

              <v-btn
                size="x-small"
                variant="tonal"
                color="primary"
                prepend-icon="mdi-arrow-left"
                @click="rightPanelTab = 'squad'"
              >
                Back to Squad
              </v-btn>
            </div>

            <!-- Player Hero Header -->
            <div class="d-flex align-start gap-3 mb-3">
              <!-- Jersey / Number Avatar -->
              <div class="player-profile-avatar text-center">
                <v-avatar size="50" color="indigo-darken-3" class="elevation-2 border">
                  <span class="text-h6 font-weight-bold text-white">
                    {{ selectedPlayer.ShirtNumber || '—' }}
                  </span>
                </v-avatar>
                <div class="mt-1">
                  <v-chip
                    size="x-small"
                    :color="getPositionColor(selectedPlayer.Position)"
                    class="font-weight-bold"
                  >
                    {{ selectedPlayer.Position }}
                  </v-chip>
                </div>
              </div>

              <!-- Name & Key Bio -->
              <div class="flex-grow-1">
                <div class="d-flex justify-space-between align-center">
                  <div class="text-subtitle-1 font-weight-bold leading-tight">
                    {{ selectedPlayer.FirstName }} {{ selectedPlayer.LastName }}
                  </div>
                  <!-- OVR Badge -->
                  <div class="text-right">
                    <v-chip
                      size="small"
                      color="amber-darken-1"
                      variant="flat"
                      class="font-weight-black text-black px-2"
                    >
                      OVR {{ Math.round(selectedPlayer.Rating ?? 60) }}
                    </v-chip>
                  </div>
                </div>

                <div class="text-caption text-medium-emphasis d-flex flex-wrap align-center gap-2 mt-1">
                  <span>🌍 {{ getPlayerNationality(selectedPlayer) }}</span>
                  <span>•</span>
                  <span>Age {{ selectedPlayer.Age }}</span>
                  <span>•</span>
                  <span>Role: {{ selectedPlayer.Role || 'Standard' }}</span>
                </div>

                <!-- Status Tags -->
                <div class="d-flex flex-wrap gap-1 mt-2">
                  <!-- Lineup Status -->
                  <v-chip
                    size="x-small"
                    :color="selectedPlayerStatus?.color || 'grey'"
                    variant="tonal"
                    class="font-weight-medium"
                  >
                    {{ selectedPlayerStatus?.label }}
                  </v-chip>

                  <!-- Fitness Badge -->
                  <v-chip
                    size="x-small"
                    :color="getFitnessColor(selectedPlayer.Fitness ?? 100)"
                    variant="tonal"
                  >
                    ⚡ Fit {{ Math.round(selectedPlayer.Fitness ?? 100) }}%
                  </v-chip>

                  <!-- Morale Badge -->
                  <v-chip
                    v-if="selectedPlayer.Morale"
                    size="x-small"
                    :color="getMoraleColor(selectedPlayer.Morale)"
                    variant="tonal"
                  >
                    😊 {{ selectedPlayer.Morale }}
                  </v-chip>

                  <!-- Injury Badge -->
                  <v-chip
                    v-if="isInjured(selectedPlayer)"
                    size="x-small"
                    color="error"
                    variant="flat"
                  >
                    🏥 Injured ({{ selectedPlayer.Injury?.daysRemaining }}d)
                  </v-chip>
                </div>
              </div>
            </div>

            <!-- Financial & Form Metrics Grid -->
            <v-sheet rounded class="pa-2 bg-surface-light mb-3">
              <v-row dense>
                <v-col cols="6" sm="3">
                  <div class="text-caption text-medium-emphasis">Value</div>
                  <div class="text-body-2 font-weight-bold text-success">
                    {{ currency(selectedPlayer.Value) }}
                  </div>
                </v-col>
                <v-col cols="6" sm="3">
                  <div class="text-caption text-medium-emphasis">Wage</div>
                  <div class="text-body-2 font-weight-bold">
                    {{ currency(selectedPlayer.Wage) }}<span class="text-caption text-disabled">/yr</span>
                  </div>
                </v-col>
                <v-col cols="6" sm="3">
                  <div class="text-caption text-medium-emphasis">Preferred Foot</div>
                  <div class="text-body-2 font-weight-bold">
                    {{ selectedPlayer.Attributes?.PreferredFoot || 'Right' }}
                  </div>
                </v-col>
                <v-col cols="6" sm="3">
                  <div class="text-caption text-medium-emphasis">Match Form</div>
                  <div class="text-body-2 font-weight-bold text-primary">
                    {{ selectedPlayer.Form ? Number(selectedPlayer.Form).toFixed(1) : '7.0' }} / 10
                  </div>
                </v-col>
              </v-row>
            </v-sheet>

            <!-- Tactical Management Actions -->
            <div v-if="!readOnly" class="d-flex flex-wrap gap-2 mb-3 pb-2 border-b border-opacity-25">
              <v-btn
                size="small"
                variant="tonal"
                :color="swapCandidate?.id === selectedPlayer._id ? 'error' : 'amber-lighten-1'"
                :prepend-icon="swapCandidate?.id === selectedPlayer._id ? 'mdi-close' : 'mdi-swap-horizontal'"
                @click="toggleSwapForSelected"
              >
                {{ swapCandidate?.id === selectedPlayer._id ? 'Cancel Swap' : 'Swap Player' }}
              </v-btn>

              <v-btn
                v-if="selectedPlayerStatus?.type === 'reserve'"
                size="small"
                variant="tonal"
                color="primary"
                prepend-icon="mdi-plus"
                :disabled="benchPlayers.length >= 7"
                @click="promoteSelectedToBench"
              >
                Add to Bench
              </v-btn>

              <v-btn
                v-if="selectedPlayerStatus?.type === 'bench'"
                size="small"
                variant="tonal"
                color="error"
                prepend-icon="mdi-arrow-down"
                @click="dropSelectedToReserves"
              >
                Drop to Reserves
              </v-btn>

              <v-btn
                v-if="selectedPlayerStatus?.type === 'starter'"
                size="small"
                variant="tonal"
                color="primary"
                prepend-icon="mdi-seat"
                @click="moveSelectedStarterToBench"
              >
                Move to Bench
              </v-btn>
            </div>

            <!-- Attribute Breakdown Sections -->
            <div class="attributes-scroll-container pr-1" style="max-height: 380px; overflow-y: auto;">
              <div
                v-for="group in selectedPlayerAttributes"
                :key="group.category"
                class="mb-3"
              >
                <div class="text-caption font-weight-bold text-medium-emphasis mb-1 text-uppercase tracking-wider">
                  {{ group.category }}
                </div>
                <v-row dense>
                  <v-col
                    v-for="attr in group.items"
                    :key="attr.name"
                    cols="6"
                  >
                    <div class="d-flex justify-space-between align-center text-caption mb-1">
                      <span class="text-truncate mr-1" :title="attr.name">{{ attr.name }}</span>
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
                      bg-color="grey-darken-3"
                    ></v-progress-linear>
                  </v-col>
                </v-row>
              </div>
            </div>
          </v-card>
        </div>
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
import { currency } from '@/helpers/misc';

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
const suggesting = ref(false);
const suggestion = ref<any | null>(null);
const snackbar = ref(false);
const snackbarMessage = ref('');

// Right-panel view mode: 'squad' (Bench/Reserves) or 'details' (Player dossier)
const rightPanelTab = ref<'squad' | 'details'>('squad');
const selectedPlayer = ref<any | null>(null);

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

const POS_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, ATT: 3 };

/** Plain-language problems with the current XI, so the shape can be fixed. */
const lineupIssues = computed(() => {
  const issues: string[] = [];
  const slots = pitchSlots.value;
  const filled = slots.filter((s) => s.player);
  if (filled.length < 11) issues.push(`${11 - filled.length} slot(s) are empty.`);

  for (const pos of ['GK', 'DEF', 'MID', 'ATT']) {
    const needed = slots.filter((s) => s.pos === pos).length;
    const natural = filled.filter((s) => s.pos === pos && s.player.Position === pos).length;
    if (natural < needed) {
      const fitInSquad = allClubPlayers.value.filter(
        (p: any) => p.Position === pos && !isInjured(p)
      ).length;
      issues.push(
        `${selectedFormation.value} needs ${needed} ${pos}, but only ${natural} starting ${pos === 'GK' ? 'is' : 'are'} natural ${pos} (${fitInSquad} fit in the squad).`
      );
    }
  }

  const misplaced = filled.filter((s) => s.player.Position !== s.pos);
  if (misplaced.length) {
    issues.push(
      'Out of position: ' +
        misplaced.map((s) => `${s.player.LastName || s.player.FirstName} (${s.player.Position} as ${s.pos})`).join(', ') +
        '.'
    );
  }

  const hurt = filled.filter((s) => isInjured(s.player));
  if (hurt.length) {
    issues.push(
      'Injured starters (the match engine will replace them): ' +
        hurt.map((s) => s.player.LastName || s.player.FirstName).join(', ') +
        '.'
    );
  }
  return issues;
});

const benchPlayers = computed(() => {
  return benchIds.value
    .map((id) => allClubPlayers.value.find((p: any) => String(p._id) === id))
    .filter(Boolean);
});

const reservePlayers = computed(() => {
  const selected = new Set([...starterIds.value, ...benchIds.value]);
  return allClubPlayers.value
    .filter((p: any) => !selected.has(String(p._id)))
    .sort(
      (a: any, b: any) =>
        (POS_ORDER[a.Position] ?? 9) - (POS_ORDER[b.Position] ?? 9) || (b.Rating ?? 0) - (a.Rating ?? 0)
    );
});

const emptyBenchSlotsCount = computed(() => Math.max(0, 7 - benchPlayers.value.length));

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

async function askForSuggestion() {
  if (!props.club?._id) return;
  suggesting.value = true;
  try {
    const anchors = FORMATION_ANCHORS[selectedFormation.value] || FORMATION_ANCHORS['4-3-3'];
    const res = await client.clubs.suggestLineup.mutation({
      params: { id: props.club._id },
      body: {
        formation: selectedFormation.value,
        style: selectedStyle.value,
        slots: anchors.map((a) => ({ label: a.label, pos: a.pos as 'GK' | 'DEF' | 'MID' | 'ATT' })),
      },
    });
    if (res.status === 200) {
      suggestion.value = res.body.payload;
    } else {
      snackbarMessage.value = `Could not get a suggestion: ${res.body.message}`;
      snackbar.value = true;
    }
  } catch (e) {
    console.error('Lineup suggestion failed:', e);
    snackbarMessage.value = 'Could not get a lineup suggestion';
    snackbar.value = true;
  } finally {
    suggesting.value = false;
  }
}

function applySuggestion() {
  if (!suggestion.value) return;
  const ids: string[] = new Array(11).fill('');
  for (const s of suggestion.value.starters) ids[s.slot] = s.playerId;
  starterIds.value = ids;
  benchIds.value = [...suggestion.value.bench];
  suggestion.value = null;
  snackbarMessage.value = 'Suggestion applied - review it, then Save Tactics.';
  snackbar.value = true;
}

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

const selectedPlayerStatus = computed(() => {
  if (!selectedPlayer.value) return null;
  const id = String(selectedPlayer.value._id);
  const starterIndex = starterIds.value.findIndex((sId) => sId === id);
  if (starterIndex !== -1) {
    const anchors = FORMATION_ANCHORS[selectedFormation.value] || FORMATION_ANCHORS['4-3-3'];
    const anchor = anchors[starterIndex];
    return {
      type: 'starter',
      index: starterIndex,
      label: `Starting XI (${anchor?.label || 'POS'})`,
      color: 'success',
    };
  }
  const benchIndex = benchIds.value.findIndex((bId) => bId === id);
  if (benchIndex !== -1) {
    return {
      type: 'bench',
      index: benchIndex,
      label: `Substitute (Bench #${benchIndex + 1})`,
      color: 'primary',
    };
  }
  return {
    type: 'reserve',
    label: 'Reserves Pool',
    color: 'grey',
  };
});

const selectedPlayerAttributes = computed(() => {
  if (!selectedPlayer.value) return [];
  const attrs = selectedPlayer.value.Attributes ?? {};

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
    ...(selectedPlayer.value.Position === 'GK' || getVal('Keeping') > 30
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

function getMoraleColor(morale?: string | null): string {
  const m = (morale || '').toLowerCase();
  if (m.includes('superb') || m.includes('excellent') || m.includes('high')) return 'success';
  if (m.includes('good') || m.includes('content')) return 'info';
  if (m.includes('poor') || m.includes('low') || m.includes('unhappy')) return 'error';
  return 'amber-darken-1';
}

function getPlayerNationality(player: any): string {
  if (!player) return 'Unknown';
  if (player.Nationality?.Name) return player.Nationality.Name;
  if (typeof player.Nationality === 'string') return player.Nationality;
  if (player.NationalityId) return player.NationalityId;
  return 'System League';
}

function navigatePlayer(direction: 'prev' | 'next') {
  if (!selectedPlayer.value || allClubPlayers.value.length <= 1) return;
  const currentIndex = allClubPlayers.value.findIndex(
    (p: any) => String(p._id) === String(selectedPlayer.value._id)
  );
  if (currentIndex === -1) return;
  let nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
  if (nextIndex >= allClubPlayers.value.length) nextIndex = 0;
  if (nextIndex < 0) nextIndex = allClubPlayers.value.length - 1;
  selectedPlayer.value = allClubPlayers.value[nextIndex];
}

function toggleSwapForSelected() {
  if (!selectedPlayer.value || props.readOnly) return;
  const pId = String(selectedPlayer.value._id);
  if (swapCandidate.value?.id === pId) {
    swapCandidate.value = null;
    return;
  }
  const status = selectedPlayerStatus.value;
  swapCandidate.value = {
    id: pId,
    source: (status?.type as any) || 'reserve',
    index: status?.index,
  };
  snackbarMessage.value = `Swapping ${selectedPlayer.value.FirstName} ${selectedPlayer.value.LastName}. Click any player to swap.`;
  snackbar.value = true;
}

function promoteSelectedToBench() {
  if (!selectedPlayer.value) return;
  moveReserveToBench(selectedPlayer.value);
}

function dropSelectedToReserves() {
  if (!selectedPlayer.value) return;
  const pId = String(selectedPlayer.value._id);
  const benchIndex = benchIds.value.findIndex((id) => id === pId);
  if (benchIndex !== -1) {
    removeBenchPlayer(benchIndex);
  }
}

function moveSelectedStarterToBench() {
  if (!selectedPlayer.value) return;
  const pId = String(selectedPlayer.value._id);
  const starterIndex = starterIds.value.findIndex((id) => id === pId);
  if (starterIndex !== -1) {
    if (benchIds.value.length < 7) {
      benchIds.value.push(pId);
      starterIds.value[starterIndex] = '';
    } else {
      toggleSwapForSelected();
    }
  }
}

function handlePlayerClick(
  player: any,
  source: 'starter' | 'bench' | 'reserve',
  index?: number
) {
  if (!player && source === 'starter' && swapCandidate.value && !props.readOnly) {
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

  // If in active swap mode and not read only, perform swap
  if (swapCandidate.value && !props.readOnly) {
    const first = swapCandidate.value;
    if (first.id === clickedId) {
      // Deselect swap candidate
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
    snackbarMessage.value = 'Players swapped successfully!';
    snackbar.value = true;
    selectedPlayer.value = player;
    return;
  }

  // Standard click: select player and show their details in the side panel
  selectedPlayer.value = player;
  rightPanelTab.value = 'details';
}

function moveReserveToBench(player: any) {
  if (props.readOnly || !player) return;
  const pId = String(player._id);
  if (benchIds.value.length < 7) {
    benchIds.value.push(pId);
    if (swapCandidate.value?.id === pId) {
      swapCandidate.value = null;
    }
  } else {
    // Bench is full, select as swap candidate
    swapCandidate.value = { id: pId, source: 'reserve' };
    snackbarMessage.value = 'Bench is full (7/7). Click a bench player to swap.';
    snackbar.value = true;
  }
}

function removeBenchPlayer(index: number) {
  if (props.readOnly) return;
  const removedId = benchIds.value[index];
  benchIds.value.splice(index, 1);
  if (swapCandidate.value?.id === removedId) {
    swapCandidate.value = null;
  }
}

function handleEmptyBenchSlotClick(slotIndex: number) {
  if (props.readOnly) return;
  if (swapCandidate.value) {
    const candId = swapCandidate.value.id;
    if (swapCandidate.value.source === 'starter' && swapCandidate.value.index !== undefined) {
      starterIds.value[swapCandidate.value.index] = '';
    } else if (swapCandidate.value.source === 'bench') {
      benchIds.value = benchIds.value.filter((id) => id !== candId);
    }
    if (benchIds.value.length < 7) {
      benchIds.value.push(candId);
    }
    swapCandidate.value = null;
  }
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
.pitch-player-slot.inspecting {
  outline: 3px solid #29b6f6;
  border-radius: 8px;
  transform: translate(-50%, -50%) scale(1.12);
  box-shadow: 0 0 15px rgba(41, 182, 246, 0.8);
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

.player-natural {
  font-size: 9px;
  font-weight: bold;
  color: #cfd8dc;
  margin-top: 1px;
}
.player-natural.mismatch {
  color: #fff;
  background: #e53935;
  border-radius: 3px;
  padding: 0 3px;
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
.bench-item.inspecting,
.reserve-item.inspecting {
  outline: 2px solid #29b6f6;
  background: rgba(41, 182, 246, 0.15);
}

.empty-bench-slot {
  background: rgba(255, 255, 255, 0.02);
  border-color: rgba(255, 255, 255, 0.15) !important;
  transition: all 0.2s ease;
}
.empty-bench-slot:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 215, 0, 0.4) !important;
}

.player-details-card {
  background: #1e293b;
  border-radius: 12px;
}

.attributes-scroll-container::-webkit-scrollbar {
  width: 6px;
}
.attributes-scroll-container::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.1);
}
.attributes-scroll-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}
</style>
