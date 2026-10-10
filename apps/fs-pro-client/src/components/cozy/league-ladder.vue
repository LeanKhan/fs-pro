<template>
  <section class="lad">
    <div v-if="loading && !standing" class="lad-state">Loading the ladder…</div>
    <div v-else-if="error && !standing" class="lad-state bad" role="alert">
      <p>{{ error }}</p>
      <button class="btn small" @click="load">Try again</button>
    </div>

    <template v-else>
      <header class="lad-head">
        <h2><span class="ic" v-html="icon('trophy')"></span> Standing ladder</h2>
        <button class="btn small" @click="load">Refresh</button>
      </header>

      <div v-if="standingS" class="lad-card hero">
        <div class="hero-top">
          <span class="rung">{{ standingS.leagueLabel }}</span>
          <span class="mult">{{ standingS.multiplierLabel }} loot</span>
        </div>
        <div class="hero-row">
          <div class="stat"><small>Standing</small><b>{{ count(standingS.points) }}</b></div>
          <div class="stat"><small>Global rank</small><b>{{ standingS.rank ?? '–' }}</b></div>
        </div>
      </div>

      <div class="lad-card">
        <div class="card-head">
          <h3>Weekly pool</h3>
          <span v-if="poolS" class="chip">Pool {{ poolS.pool }}</span>
        </div>
        <template v-if="poolS">
          <div class="pool-grid">
            <div class="pstat"><b>{{ poolS.attacksLeft }}</b><small>attacks left</small></div>
            <div class="pstat"><b>{{ poolS.attacksUsed }}/{{ poolS.attacksAllowed }}</b><small>attacks used</small></div>
            <div class="pstat"><b>{{ poolS.defenses }}</b><small>defenses faced</small></div>
            <div class="pstat"><b>{{ poolS.stars }}</b><small>stars</small></div>
          </div>
          <p class="note">
            <template v-if="poolS.placement">Placed #{{ poolS.placement }} in your pool.</template>
            <template v-else>Play ranked raids this week to be placed.</template>
            <span class="week"> {{ poolS.weekKey }}</span>
          </p>
        </template>
        <template v-else>
          <p class="note">You are not in this week's tournament pool yet.</p>
          <button class="btn primary" :disabled="signingUp" @click="signup">
            {{ signingUp ? 'Joining…' : 'Join the weekly pool' }}
          </button>
        </template>
      </div>

      <div class="lad-card">
        <div class="card-head">
          <h3>Form Bonus</h3>
          <span v-if="formS" class="chip" :class="{ ready: formS.ready }">
            {{ formS.ready ? 'Ready' : formS.label }}
          </span>
        </div>
        <div v-if="formS" class="bar" aria-hidden="true">
          <i :style="{ width: `${Math.round(formS.fill * 100)}%` }"></i>
        </div>
        <p v-if="formS" class="note">
          Earn {{ formS.required }}★ within 24h for a league-scaled loot drop into the Board Vault.
          <template v-if="formS.nextResetAt && serverNow">
            Reset
            <cozy-countdown :at="formS.nextResetAt" :server-now="serverNow" />
          </template>
        </p>
        <button class="btn primary" :disabled="claiming" @click="claimVault">
          {{ claiming ? 'Claiming…' : 'Claim Board Vault' }}
        </button>
        <p v-if="!vaultGate.claimable" class="note">{{ vaultGate.reason }}</p>
        <p v-if="lastClaim" class="note good" role="status">
          Claimed {{ currency(lastClaim.claimed) }}.
        </p>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { BoardVaultClaim, FormBonus, Standing, StandingPool } from '@repo/api-contract';
import { client } from '@/services/api';
import { payloadOrNull } from '@/helpers/envelope';
import { currency } from '@/helpers/misc';
import {
  formBonusView,
  poolView,
  standingView,
  vaultClaimGate,
} from '@/helpers/league-ladder';
import { icon } from './icons';
import CozyCountdown from './cozy-countdown.vue';

/**
 * The Standing-ladder surface (docs/coc-mapping/04 §4-§5, 08 §2 P6, OW-N10).
 *
 * Standing Points + rung + global rank, the weekly tournament pool
 * (attacks/defenses against the allowance) with `league.signup`, the rolling
 * Form Bonus progress and `play.claimBoardVault`. Every timer renders through
 * `CozyCountdown` off the absolute UTC `nextResetAt` and the campus server clock
 * (`serverNow`), never a duration (04 §12). Plain HTML/CSS + cozy tokens.
 */
const props = defineProps<{ clubId: string; serverNow: string | null }>();
const emit = defineEmits<{ (e: 'toast', text: string, level?: 'success' | 'error'): void }>();

const standing = ref<Standing | null>(null);
const pool = ref<StandingPool | null>(null);
const form = ref<FormBonus | null>(null);
const loading = ref(false);
const signingUp = ref(false);
const claiming = ref(false);
const error = ref('');
const lastClaim = ref<BoardVaultClaim | null>(null);

const standingS = computed(() => (standing.value ? standingView(standing.value) : null));
const poolS = computed(() => (pool.value ? poolView(pool.value) : null));
const formS = computed(() => (form.value ? formBonusView(form.value) : null));
const vaultGate = computed(() => vaultClaimGate(0, formS.value?.ready ?? false));

const count = (n: number) => Math.floor(n).toLocaleString('en-US');

async function load() {
  if (!props.clubId) return;
  loading.value = true;
  error.value = '';
  const [s, p, f] = await Promise.all([
    client.league.standing.query({ params: { clubId: props.clubId } }),
    client.league.pool.query({ params: { clubId: props.clubId } }),
    client.league.formBonus.query({ params: { clubId: props.clubId } }),
  ]);
  const nextStanding = payloadOrNull<Standing>(s);
  if (nextStanding) standing.value = nextStanding;
  pool.value = payloadOrNull<StandingPool>(p);
  const nextForm = payloadOrNull<FormBonus>(f);
  if (nextForm) form.value = nextForm;
  if (!nextStanding) error.value = 'Could not load the ladder.';
  loading.value = false;
}

async function signup() {
  if (!props.clubId || signingUp.value) return;
  signingUp.value = true;
  const res = await client.league.signup.mutation({ body: { clubId: props.clubId } });
  const next = payloadOrNull<StandingPool>(res);
  if (next) {
    pool.value = next;
    emit('toast', 'You joined the weekly pool.');
  } else {
    emit('toast', 'Could not join the pool.', 'error');
  }
  signingUp.value = false;
}

async function claimVault() {
  if (!props.clubId || claiming.value) return;
  claiming.value = true;
  const res = await client.play.claimBoardVault.mutation({
    params: { clubId: props.clubId },
    body: {},
  });
  const next = payloadOrNull<BoardVaultClaim>(res);
  if (next) {
    lastClaim.value = next;
    emit('toast', `Claimed ${currency(next.claimed)} from the Board Vault.`);
  } else {
    emit('toast', 'The Board Vault is empty (or unavailable right now).', 'error');
  }
  claiming.value = false;
}

onMounted(load);
</script>

<style scoped>
.lad {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: var(--ink, #4a3220);
  font-family: 'Fredoka', system-ui, sans-serif;
}
.lad-state {
  padding: 20px;
  text-align: center;
}
.lad-state.bad {
  color: var(--red, #e5402f);
}
.lad-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.lad-head h2 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 20px;
}
.lad-head .ic {
  width: 24px;
  height: 24px;
}
.lad-card {
  padding: 12px;
  border-radius: 14px;
  background: #fffaf0;
  border: 3px solid #e2cc9c;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.lad-card.hero {
  background: linear-gradient(#fff6df, #f7e6bd);
}
.hero-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.rung {
  font-size: 22px;
  font-weight: 800;
}
.mult {
  font-size: 13px;
  font-weight: 700;
  color: var(--green-d, #2f8a1c);
}
.hero-row {
  display: flex;
  gap: 20px;
}
.stat,
.pstat {
  display: flex;
  flex-direction: column;
}
.stat small,
.pstat small {
  font-size: 11px;
  color: var(--muted, #6f5940);
}
.stat b {
  font-size: 20px;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-head h3 {
  margin: 0;
  font-size: 16px;
}
.chip {
  padding: 2px 9px;
  border-radius: 999px;
  background: #fff8e6;
  border: 2px solid #e2cc9c;
  font-size: 12px;
  font-weight: 700;
}
.chip.ready {
  color: #2f8a1c;
  border-color: #bfe3a5;
}
.pool-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.pstat b {
  font-size: 18px;
}
.bar {
  height: 10px;
  border-radius: 999px;
  background: rgba(138, 90, 59, 0.15);
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--gold, #f5b82e), var(--green, #5cc23a));
}
.note {
  margin: 0;
  font-size: 12.5px;
  color: var(--muted, #6f5940);
}
.note.good {
  color: var(--green-d, #2f8a1c);
  font-weight: 700;
}
.week {
  font-weight: 700;
  color: var(--ink, #4a3220);
}
@media (max-width: 480px) {
  .pool-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
