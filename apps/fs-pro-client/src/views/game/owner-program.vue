<template>
  <div v-if="loading && !state" class="op-load">Opening the owner's program…</div>
  <div v-else-if="error && !state" class="op-load">
    <p>{{ error }}</p>
  </div>

  <program-shell
    v-else-if="state"
    :club-name="state.clubId ? clubName : 'Your club'"
    :club-code="clubCode"
    :step="state.step"
    :step-stars="state.stepStars"
    :step-index="stepIndex"
    :budget="budget"
    :program-xp="state.programXp"
    :advisor="advisor"
    :toast="toast"
    :reveal="justCompleted"
    @close="close"
    @continue="justCompleted = null"
  >
    <!-- Step 0: the starting-balance reveal -->
    <program-balance
      v-if="showBalance"
      :balance="state.startingBalance"
      :club-name="clubName"
      :club-code="clubCode"
      @begin="beginProgram"
    />

    <!-- Step 1: sign a manager -->
    <program-managers
      v-else-if="state.step === 'manager'"
      :list="managers ?? { managers: [], budget, interviewFee: 25_000 }"
      :budget="budget"
      :starting-balance="state.startingBalance"
      :busy="busy"
      @interview="onInterview"
      @confirm-sign="onSignManager"
    />

    <!-- Step 2: build the squad -->
    <program-squad
      v-else-if="state.step === 'players'"
      :market="players"
      :budget="budget"
      :manager-signed="stepIndex >= 1"
      :squad-count="squadCount"
      :gk-count="gkCount"
      :transfer-window="transferWindow"
      :other-players="otherPlayers"
      :busy="busy"
      @scout="onScout"
      @sign="onSignPlayer"
      @buy="onBuyPlayer"
      @advance="onBoardAdvance"
    />

    <!-- Step 3: build a Tier-1 facility -->
    <program-facilities
      v-else-if="state.step === 'facilities'"
      :campus="campus"
      :budget="budget"
      :busy="busy"
      @build="onBuild"
      @advance="onBoardAdvance"
    />

    <!-- Step 4: reach Level 1 -> the league draw -->
    <program-level1
      v-else
      :play-state="playState"
      :program-xp="state.programXp"
      :celebrate="state.step === 'done'"
      :busy="busy"
      @play="goPlay"
      @advance="onBoardAdvance"
      @close="close"
    />
  </program-shell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ProgramManager, ProgramPlayer, Player as MarketPlayer } from '@repo/api-contract';
import { useOwnerProgram } from '@/composables/use-owner-program';
import ProgramShell from '@/components/program/program-shell.vue';
import ProgramBalance from '@/components/program/program-balance.vue';
import ProgramManagers from '@/components/program/program-managers.vue';
import ProgramSquad from '@/components/program/program-squad.vue';
import ProgramFacilities from '@/components/program/program-facilities.vue';
import ProgramLevel1 from '@/components/program/program-level1.vue';

const route = useRoute();
const router = useRouter();
const clubId = computed(() => route.params.clubId as string);

const program = useOwnerProgram(clubId);
const {
  state,
  managers,
  players,
  campus,
  playState,
  transferWindow,
  otherPlayers,
  loading,
  busy,
  error,
  toast,
  justCompleted,
  budget,
  stepIndex,
  advisor,
  club,
  squadCount,
  gkCount,
  load,
  doInterview,
  doSignManager,
  doScout,
  doSignFreeAgent,
  doBuyPlayer,
  doBuild,
  doBoardAdvance,
  advance,
} = program;

const clubName = computed(() => club.value?.Name ?? 'Your club');
const clubCode = computed(() => club.value?.ClubCode);

/** The balance reveal is a once-per-club moment (step 0, no persisted flag). */
const revealed = ref(true);
function flagKey(): string {
  return `fspro_owner_balance_${clubId.value}`;
}
function syncRevealFlag() {
  try {
    revealed.value = localStorage.getItem(flagKey()) === '1';
  } catch {
    revealed.value = true;
  }
}
const showBalance = computed(
  () => !!state.value && state.value.step === 'manager' && !revealed.value && !state.value.stepStars.manager
);

function beginProgram() {
  try {
    localStorage.setItem(flagKey(), '1');
  } catch {
    // Private mode: the reveal just shows again next time.
  }
  revealed.value = true;
}

watch(clubId, syncRevealFlag, { immediate: true });

onMounted(async () => {
  await load();
  syncRevealFlag();
});

// --- Action handlers: act, then re-check the predicate ---------------------
async function onInterview(m: ProgramManager) {
  await doInterview(m);
}
async function onSignManager(m: ProgramManager, years: number) {
  await doSignManager(m, years);
  await advance();
}
async function onScout(p: ProgramPlayer) {
  await doScout(p);
}
async function onSignPlayer(p: ProgramPlayer) {
  await doSignFreeAgent(p);
  await advance();
}
async function onBuyPlayer(p: MarketPlayer) {
  await doBuyPlayer(p);
  await advance();
}
async function onBuild(type: string) {
  await doBuild(type);
  await advance();
}
async function onBoardAdvance() {
  await doBoardAdvance();
}

function goPlay() {
  router.push({ path: `/game/${clubId.value}`, query: { open: 'play' } });
}
function close() {
  router.push(`/game/${clubId.value}`);
}
</script>

<style scoped>
.op-load {
  position: fixed;
  inset: 0;
  display: grid;
  place-content: center;
  gap: 10px;
  text-align: center;
  font-family: 'Fredoka', system-ui, sans-serif;
  font-size: 20px;
  color: #4a3220;
  background: linear-gradient(#bfe4ff, #fdf4df);
}
</style>
