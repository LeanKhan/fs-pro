<template>
  <v-dialog v-model="show" max-width="480" persistent>
    <v-card class="matchmaking-dialog pa-5 rounded-2xl text-center">
      <!-- State 1: Searching for Opponent -->
      <div v-if="searching" class="py-6">
        <div class="radar-container mx-auto mb-4">
          <div class="radar-sweep"></div>
          <span class="radar-icon">⚔️</span>
        </div>
        <div class="text-h6 font-weight-bold text-white mb-1">Scouting Matchmaking Pool...</div>
        <div class="text-caption text-medium-emphasis">
          Matching opponents near Club Power {{ myPower }}
        </div>
      </div>

      <!-- State 2: Opponent Found / Pre-Battle VS Screen -->
      <div v-else-if="opponent" class="py-3">
        <div class="text-overline text-amber font-weight-bold letter-spacing-2 mb-2">
          MATCHMAKING CONFIRMED
        </div>

        <div class="vs-container d-flex align-center justify-space-between my-4 px-2">
          <!-- Home Team -->
          <div class="team-side d-flex flex-column align-center flex-1">
            <div class="team-avatar-box mb-2">
              <span class="team-emoji">👑</span>
            </div>
            <span class="team-name font-weight-bold text-white text-truncate">{{ myClubName }}</span>
            <v-chip size="x-small" color="primary" class="mt-1 font-weight-bold">
              ⚔ Power {{ myPower }}
            </v-chip>
          </div>

          <!-- VS Badge -->
          <div class="vs-badge-wrapper px-3">
            <span class="vs-text font-weight-black">VS</span>
          </div>

          <!-- Away Team -->
          <div class="team-side d-flex flex-column align-center flex-1">
            <div class="team-avatar-box opponent mb-2">
              <span class="team-emoji">🦁</span>
            </div>
            <span class="team-name font-weight-bold text-white text-truncate">{{ opponent.name }}</span>
            <v-chip size="x-small" color="amber-darken-2" class="mt-1 font-weight-bold">
              ⚔ Power {{ opponent.power }}
            </v-chip>
          </div>
        </div>

        <!-- Stakes / Rewards Preview -->
        <v-card variant="tonal" color="indigo-darken-4" class="pa-3 mb-4 rounded-xl text-left">
          <div class="text-caption font-weight-bold text-indigo-lighten-2 mb-1">MATCH STAKES & REWARDS</div>
          <div class="d-flex justify-space-between text-caption text-medium-emphasis mb-1">
            <span>Victory Bounty:</span>
            <strong class="text-success">💵 $25,000 + 30 XP</strong>
          </div>
          <div class="d-flex justify-space-between text-caption text-medium-emphasis mb-1">
            <span>Draw / Defeat:</span>
            <strong class="text-white">$8,000 / $2,000</strong>
          </div>
          <div class="d-flex justify-space-between text-caption text-medium-emphasis">
            <span>Stadium Gate:</span>
            <strong class="text-teal-lighten-2">Home Crowd Ticket Receipts</strong>
          </div>
        </v-card>

        <!-- Actions -->
        <div class="d-flex gap-3">
          <v-btn
            variant="tonal"
            color="grey-lighten-1"
            size="large"
            class="flex-1"
            :disabled="starting"
            @click="show = false"
          >
            Cancel
          </v-btn>
          <v-btn
            color="amber-darken-2"
            size="large"
            class="flex-2 font-weight-black text-uppercase"
            variant="flat"
            :loading="starting"
            @click="$emit('start-battle')"
          >
            ⚔️ BATTLE NOW
          </v-btn>
        </div>
      </div>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    searching?: boolean;
    starting?: boolean;
    myClubName?: string;
    myPower?: number;
    opponent?: { name: string; power: number } | null;
  }>(),
  {
    modelValue: false,
    searching: false,
    starting: false,
    myClubName: 'Segun FC',
    myPower: 180,
    opponent: null,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'start-battle'): void;
}>();

const show = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val),
});
</script>

<style scoped>
.matchmaking-dialog {
  background: rgba(15, 23, 42, 0.96) !important;
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(16px);
}

.radar-container {
  width: 90px;
  height: 90px;
  border-radius: 50%;
  border: 2px solid rgba(245, 158, 11, 0.4);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle, rgba(245, 158, 11, 0.15) 0%, transparent 70%);
}

.radar-sweep {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border-right: 2px solid #fbbf24;
  animation: sweep 1.5s linear infinite;
}

.radar-icon {
  font-size: 2rem;
}

@keyframes sweep {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.team-avatar-box {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: linear-gradient(135deg, #1e293b, #0f172a);
  border: 2px solid #3b82f6;
  display: flex;
  align-items: center;
  justify-content: center;
}

.team-avatar-box.opponent {
  border-color: #f59e0b;
}

.team-emoji {
  font-size: 1.8rem;
}

.team-name {
  max-width: 140px;
  font-size: 0.9rem;
}

.vs-badge-wrapper {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 50%;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.vs-text {
  color: #fbbf24;
  font-size: 0.9rem;
  letter-spacing: 0.05em;
}

.letter-spacing-2 {
  letter-spacing: 2px;
}
</style>
