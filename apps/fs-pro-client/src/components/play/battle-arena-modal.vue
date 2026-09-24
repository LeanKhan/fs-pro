<template>
  <v-dialog v-model="show" max-width="640" persistent>
    <v-card class="battle-arena pa-4 rounded-2xl text-center">
      <!-- Arena Header -->
      <div class="arena-top-bar d-flex align-center justify-space-between mb-3 px-2">
        <div class="d-flex align-center gap-2">
          <span class="arena-badge font-weight-black">⚔️ ARENA CLASH</span>
          <span v-if="coachingLevel > 0" class="coaching-badge font-weight-bold text-caption">
            ⭐ Coach Lv {{ coachingLevel }}
          </span>
        </div>
        <div class="d-flex align-center gap-2">
          <v-chip size="small" color="amber-darken-2" class="font-weight-black">
            ⏱️ {{ currentMinute }}'
          </v-chip>
          <v-btn
            size="x-small"
            variant="tonal"
            color="grey-lighten-2"
            class="font-weight-bold"
            @click="skipToEnd"
          >
            Skip ⏩
          </v-btn>
        </div>
      </div>

      <!-- Scoreboard Display -->
      <div class="battle-scoreboard d-flex align-center justify-space-between pa-3 rounded-xl mb-3">
        <!-- Home Club -->
        <div class="club-side home-side d-flex flex-column align-center flex-1">
          <div class="avatar-crest mb-1">👑</div>
          <div class="club-name font-weight-bold text-white text-truncate">{{ myClubName }}</div>
          <div class="club-power font-weight-bold text-caption text-primary">⚔ {{ myPower }}</div>
        </div>

        <!-- Big Score Center -->
        <div class="score-center d-flex flex-column align-center px-4">
          <div class="score-digits font-weight-black">
            <span :class="{ 'score-pulse': lastScorer === 'you' }">{{ displayedScore.you }}</span>
            <span class="score-divider mx-2">-</span>
            <span :class="{ 'score-pulse': lastScorer === 'them' }">{{ displayedScore.them }}</span>
          </div>
          <div class="match-phase-badge text-caption text-uppercase font-weight-bold" :class="phaseClass">
            {{ matchPhaseText }}
          </div>
        </div>

        <!-- Away Club -->
        <div class="club-side away-side d-flex flex-column align-center flex-1">
          <div class="avatar-crest opponent mb-1">🦁</div>
          <div class="club-name font-weight-bold text-white text-truncate">{{ opponent?.name || 'Opponent' }}</div>
          <div class="club-power font-weight-bold text-caption text-amber">⚔ {{ opponent?.power || 180 }}</div>
        </div>
      </div>

      <!-- Battle Momentum Meter (Tug of War) -->
      <div class="momentum-container pa-3 rounded-xl mb-3 text-left">
        <div class="d-flex justify-space-between text-caption font-weight-bold mb-1">
          <span class="text-primary">Attacking Pressure: {{ homeMomentum }}%</span>
          <span class="text-amber">Rival Pressure: {{ awayMomentum }}%</span>
        </div>
        <div class="momentum-track rounded-pill">
          <div
            class="momentum-fill-home rounded-pill"
            :style="{ width: `${homeMomentum}%` }"
          ></div>
        </div>
      </div>

      <!-- Mini Pitch Action Visualizer -->
      <div class="pitch-container pa-3 rounded-xl mb-3 position-relative">
        <div class="pitch-grass">
          <div class="pitch-line pitch-center-circle"></div>
          <div class="pitch-line pitch-half-line"></div>
          <div class="pitch-line pitch-box-left"></div>
          <div class="pitch-line pitch-box-right"></div>
        </div>

        <!-- Dynamic Action Indicator on Pitch -->
        <div class="pitch-action-indicator" :style="actionBallStyle">
          <span class="action-emoji">{{ currentActionEmoji }}</span>
        </div>

        <!-- Live Commentary Banner -->
        <div class="commentary-strip pa-2 rounded-lg">
          <div class="text-caption font-weight-bold text-white">
            <span class="text-amber font-weight-black">{{ currentMinute }}'</span> {{ currentCommentary }}
          </div>
        </div>
      </div>

      <!-- Tactical Coaching Abilities (Staff House) -->
      <div v-if="!isMatchFinished" class="tactical-deck pa-2 rounded-xl mb-3 text-left">
        <div class="text-caption font-weight-bold text-medium-emphasis mb-2 d-flex justify-space-between align-center">
          <span>TACTICAL ABILITIES (COACHING STAFF)</span>
          <span v-if="tacticalCooldown > 0" class="text-amber text-caption">Ready in {{ tacticalCooldown }}s</span>
          <span v-else class="text-success text-caption">Tap to activate boost!</span>
        </div>
        <div class="d-flex gap-2">
          <v-btn
            size="small"
            variant="tonal"
            color="primary"
            class="flex-1 font-weight-bold text-caption"
            :disabled="tacticalCooldown > 0"
            @click="triggerTacticalBoost('High Press')"
          >
            ⚡ High Press
          </v-btn>
          <v-btn
            size="small"
            variant="tonal"
            color="amber-darken-2"
            class="flex-1 font-weight-bold text-caption"
            :disabled="tacticalCooldown > 0 || coachingLevel < 1"
            @click="triggerTacticalBoost('Counter Attack')"
          >
            🚀 Counter Break
          </v-btn>
          <v-btn
            size="small"
            variant="tonal"
            color="teal"
            class="flex-1 font-weight-bold text-caption"
            :disabled="tacticalCooldown > 0 || coachingLevel < 2"
            @click="triggerTacticalBoost('Overload Box')"
          >
            🔥 Overload
          </v-btn>
        </div>
      </div>

      <!-- Match Finished Banner / Action -->
      <div v-if="isMatchFinished" class="match-concluded-box pa-4 rounded-xl">
        <div class="text-h5 font-weight-black mb-1" :class="outcomeColorClass">
          {{ outcomeHeadline }}
        </div>
        <div class="text-caption text-medium-emphasis mb-3">
          Full time whistle blown at the stadium arena!
        </div>
        <v-btn
          color="amber-darken-2"
          size="large"
          block
          class="font-weight-black text-uppercase"
          variant="flat"
          @click="$emit('finish')"
        >
          🎁 Claim Spoils & Rewards
        </v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { MatchResult } from '@repo/api-contract';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    result: MatchResult | null;
    myClubName?: string;
    myPower?: number;
    coachingLevel?: number;
  }>(),
  {
    modelValue: false,
    result: null,
    myClubName: 'Segun FC',
    myPower: 180,
    coachingLevel: 0,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'finish'): void;
}>();

const show = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val),
});

const opponent = computed(() => props.result?.opponent ?? null);

// Match Animation Simulation State
const currentMinute = ref(0);
const displayedScore = ref({ you: 0, them: 0 });
const homeMomentum = ref(50);
const awayMomentum = computed(() => 100 - homeMomentum.value);
const currentCommentary = ref('Kickoff! The referee signals the start of the battle.');
const currentActionEmoji = ref('⚽');
const actionPosition = ref(50); // 0 (far left) to 100 (far right)
const lastScorer = ref<'you' | 'them' | null>(null);
const tacticalCooldown = ref(0);
const isMatchFinished = ref(false);

let simInterval: ReturnType<typeof setInterval> | undefined;
let cooldownInterval: ReturnType<typeof setInterval> | undefined;

const actionBallStyle = computed(() => ({
  left: `${actionPosition.value}%`,
}));

const matchPhaseText = computed(() => {
  if (isMatchFinished.value) return 'FULL TIME';
  if (currentMinute.value >= 45 && currentMinute.value <= 48) return 'HALF TIME';
  return 'IN PLAY';
});

const phaseClass = computed(() => {
  if (isMatchFinished.value) return 'text-amber';
  return 'text-success';
});

const outcomeHeadline = computed(() => {
  const o = props.result?.outcome;
  if (o === 'win') return '🏆 GLORIOUS VICTORY!';
  if (o === 'draw') return '🤝 HARD-FOUGHT DRAW';
  return '⚔️ DEFEAT ON THE PITCH';
});

const outcomeColorClass = computed(() => {
  const o = props.result?.outcome;
  if (o === 'win') return 'text-success';
  if (o === 'draw') return 'text-primary';
  return 'text-amber-darken-2';
});

function resetSim() {
  currentMinute.value = 0;
  displayedScore.value = { you: 0, them: 0 };
  homeMomentum.value = 50;
  actionPosition.value = 50;
  lastScorer.value = null;
  tacticalCooldown.value = 0;
  isMatchFinished.value = false;
  currentCommentary.value = 'Kickoff! The referee signals the start of the clash.';
  currentActionEmoji.value = '⚽';
}

function startSimulation() {
  resetSim();
  if (!props.result) return;

  const highlights = props.result.highlights || [];
  const finalScore = props.result.score;

  // Run a high-energy ~6 second match simulation
  // 90 minutes / 90 steps = 70ms per minute tick
  simInterval = setInterval(() => {
    if (currentMinute.value >= 90) {
      skipToEnd();
      return;
    }

    currentMinute.value += 1;

    // Check if an event matches this minute
    const event = highlights.find((h) => h.minute === currentMinute.value);
    if (event) {
      currentCommentary.value = event.message;
      if (event.type === 'goal') {
        currentActionEmoji.value = '🔥';
        if (event.side === 'you') {
          displayedScore.value.you += 1;
          lastScorer.value = 'you';
          homeMomentum.value = Math.min(85, homeMomentum.value + 20);
          actionPosition.value = 85;
        } else {
          displayedScore.value.them += 1;
          lastScorer.value = 'them';
          homeMomentum.value = Math.max(15, homeMomentum.value - 20);
          actionPosition.value = 15;
        }
      } else if (event.type === 'save') {
        currentActionEmoji.value = '🧤';
        actionPosition.value = event.side === 'you' ? 20 : 80;
      } else if (event.type === 'shot') {
        currentActionEmoji.value = '🎯';
        actionPosition.value = event.side === 'you' ? 75 : 25;
      } else {
        currentActionEmoji.value = '⚡';
        actionPosition.value = event.side === 'you' ? 65 : 35;
      }
    } else {
      // Natural back-and-forth momentum drift
      const drift = (Math.random() - 0.48) * 6;
      homeMomentum.value = Math.min(80, Math.max(20, Math.round(homeMomentum.value + drift)));
      actionPosition.value = homeMomentum.value;
      if (Math.random() < 0.15) {
        currentActionEmoji.value = '⚽';
      }
    }
  }, 75);
}

function triggerTacticalBoost(name: string) {
  if (tacticalCooldown.value > 0 || isMatchFinished.value) return;
  tacticalCooldown.value = 3;
  homeMomentum.value = Math.min(90, homeMomentum.value + 15);
  actionPosition.value = 75;
  currentActionEmoji.value = '⚡';
  currentCommentary.value = `Tactical order applied: ${name}! Squad pressing forward with intensity.`;

  cooldownInterval = setInterval(() => {
    if (tacticalCooldown.value > 0) {
      tacticalCooldown.value -= 1;
    } else {
      if (cooldownInterval) clearInterval(cooldownInterval);
    }
  }, 1000);
}

function skipToEnd() {
  if (simInterval) clearInterval(simInterval);
  if (cooldownInterval) clearInterval(cooldownInterval);
  currentMinute.value = 90;
  if (props.result) {
    displayedScore.value = { ...props.result.score };
    const won = props.result.outcome === 'win';
    homeMomentum.value = won ? 75 : props.result.outcome === 'draw' ? 50 : 25;
    actionPosition.value = homeMomentum.value;
  }
  isMatchFinished.value = true;
  currentCommentary.value = 'Full time! The referee brings this thrilling battle to an end.';
  currentActionEmoji.value = '🏁';
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      startSimulation();
    } else {
      if (simInterval) clearInterval(simInterval);
      if (cooldownInterval) clearInterval(cooldownInterval);
    }
  }
);

onBeforeUnmount(() => {
  if (simInterval) clearInterval(simInterval);
  if (cooldownInterval) clearInterval(cooldownInterval);
});
</script>

<style scoped>
.battle-arena {
  background: rgba(15, 23, 42, 0.98) !important;
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 16px 56px rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(20px);
}

.arena-badge {
  color: #fbbf24;
  letter-spacing: 1.5px;
  font-size: 0.8rem;
}

.coaching-badge {
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(99, 102, 241, 0.4);
}

.battle-scoreboard {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.avatar-crest {
  font-size: 1.8rem;
}

.score-digits {
  font-size: 2.2rem;
  line-height: 1;
  color: #ffffff;
  letter-spacing: 2px;
}

.score-pulse {
  color: #f59e0b;
  animation: pulse-score 0.4s ease;
}

@keyframes pulse-score {
  0% { transform: scale(1); }
  50% { transform: scale(1.3); }
  100% { transform: scale(1); }
}

.match-phase-badge {
  letter-spacing: 1px;
}

.momentum-container,
.tactical-deck,
.match-concluded-box {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.momentum-track {
  height: 10px;
  background: #f59e0b;
  position: relative;
  overflow: hidden;
}

.momentum-fill-home {
  height: 100%;
  background: #3b82f6;
  transition: width 0.3s ease;
}

.pitch-container {
  height: 120px;
  background: radial-gradient(circle, #1e3a1e 0%, #0f2410 100%);
  border: 2px solid rgba(74, 222, 128, 0.3);
  overflow: hidden;
}

.pitch-grass {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.pitch-half-line {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  background: rgba(255, 255, 255, 0.2);
}

.pitch-center-circle {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 50px;
  height: 50px;
  margin-top: -25px;
  margin-left: -25px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.pitch-box-left {
  position: absolute;
  top: 20%;
  bottom: 20%;
  left: 0;
  width: 35px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-left: none;
}

.pitch-box-right {
  position: absolute;
  top: 20%;
  bottom: 20%;
  right: 0;
  width: 35px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-right: none;
}

.pitch-action-indicator {
  position: absolute;
  top: 28%;
  transform: translateX(-50%);
  transition: left 0.35s ease;
  z-index: 2;
}

.action-emoji {
  font-size: 1.8rem;
  filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.8));
}

.commentary-strip {
  position: absolute;
  bottom: 8px;
  left: 12px;
  right: 12px;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(8px);
}
</style>
