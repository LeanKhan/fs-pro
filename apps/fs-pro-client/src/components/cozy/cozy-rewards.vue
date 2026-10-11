<template>
  <div class="result" :class="result.outcome">
    <div class="stars" :aria-label="`${stars} of 3 stars`">
      <span v-for="i in 3" :key="i" class="star" :class="{ on: i <= stars, mid: i === 2 }" :style="{ animationDelay: `${0.25 + (i - 1) * 0.35}s` }" v-html="icon('star')"></span>
    </div>
    <h2>{{ { win: 'Victory!', draw: 'A hard-fought draw', loss: 'Defeat' }[result.outcome] }}</h2>
    <p class="star-why">{{ starWhy }}</p>
    <div class="final">
      <img :src="crestUrl(myCode)" alt="" width="56" height="56" @error="crestFallback($event, myName)" />
      <b>{{ result.score.you }} - {{ result.score.them }}</b>
      <img :src="crestUrl(result.opponent.code)" alt="" width="56" height="56" @error="crestFallback($event, result.opponent.name)" />
    </div>
    <p class="sub">{{ myName }} vs {{ result.opponent.name }}</p>
    <div v-if="raid" class="dominance" :title="`Dominance ${raid.destruction}%`">
      <i :style="{ width: `${shown(raid.destruction)}%` }"></i><span>{{ Math.round(shown(raid.destruction)) }}% dominance</span>
    </div>
    <div class="rewards">
      <template v-if="raid">
        <div><span v-html="icon('coins')"></span><b>{{ signed(shown(raid.stolen.cash), currency) }}</b><small>cash taken</small></div>
        <div><span v-html="icon('people')"></span><b>{{ signed(shown(raid.stolen.fans)) }}</b><small>fans taken</small></div>
        <div v-if="raid.stolen.tokens"><span v-html="icon('star')"></span><b>{{ signed(shown(raid.stolen.tokens)) }}</b><small>tokens taken</small></div>
        <div><span v-html="icon('trophy')"></span><b>{{ signed(shown(standingDelta)) }}</b><small>standing</small></div>
        <div v-if="raid.systemBonus"><span v-html="icon('coins')"></span><b>{{ signed(shown(raid.systemBonus), currency) }}</b><small>to Board Vault</small></div>
      </template>
      <div v-if="result.rewards.cash"><span v-html="icon('coins')"></span><b>{{ signed(shown(result.rewards.cash), currency) }}</b><small>{{ result.rewards.cash > 0 ? 'prize' : 'match costs' }}</small></div>
    </div>
    <p v-if="raid?.practice" class="sub">Practice match: no loot, no standing.</p>
    <div class="row-btns">
      <button class="btn" @click="emit('close')">Back to the grounds</button>
      <button class="btn primary" :disabled="cooldown > 0" @click="emit('again')">
        {{ cooldown > 0 ? `Squad resting ${formatRemainingSeconds(cooldown)}` : 'Attack again' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { MatchResult } from '@repo/api-contract';
import { crestUrl } from '@/helpers/crest';
import { currency } from '@/helpers/misc';
import { formatRemainingSeconds } from '@/helpers/countdown';
import { sfx } from '@/services/sfx';
import { crestFallback } from './club-colors';
import { icon } from './icons';

const props = defineProps<{
  result: MatchResult;
  myName: string;
  myCode: string;
  cooldown: number;
  /** Standing points before this match: a loss can't take the ladder below 0. */
  standingBefore?: number | null;
}>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'again'): void }>();

const raid = computed(() => props.result.raid ?? null);
const standingDelta = computed(() => {
  const d = raid.value?.standing.attacker ?? 0;
  return props.standingBefore != null ? Math.max(d, -props.standingBefore) : d;
});

/** 0-3 stars: the server's raid rating (02 §D). Without a raid summary
 * (a legacy result) fall back to the score: draw 1, win 2, big win 3. */
const stars = computed(() => {
  if (raid.value) return raid.value.stars;
  const { you, them } = props.result.score;
  if (you < them) return 0;
  if (you === them) return 1;
  return you - them >= 2 || them === 0 ? 3 : 2;
});
const starWhy = computed(() =>
  [
    'No stars this time. Their grid held.',
    'One star. Win, and win well, for more.',
    'Two stars. Dominate the match for the third.',
    'Three stars. A dominant win!',
  ][stars.value]
);

// Spoils count up from zero.
const progress = ref(0);
let raf = 0;
const shown = (n: number) => n * progress.value;
onMounted(() => {
  sfx.play(props.result.outcome === 'win' ? 'win' : props.result.outcome === 'draw' ? 'draw' : 'loss');
  for (let i = 0; i < stars.value; i++) sfx.play('star', 250 + i * 350);
  const start = performance.now() + 500;
  const step = (now: number) => {
    progress.value = Math.min(1, Math.max(0, (now - start) / 900));
    if (progress.value < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
});
onBeforeUnmount(() => cancelAnimationFrame(raf));

const signed = (n: number, f: (n: number) => string = (x) => Math.round(x).toLocaleString('en-US')) =>
  `${n >= 0 ? '+' : '-'}${f(Math.abs(n))}`;
</script>

<style scoped>
.dominance { position: relative; height: 22px; margin: 6px auto 10px; max-width: 320px; border-radius: 12px; background: #3b2a1a; border: 2px solid #2a1c10; overflow: hidden; }
.dominance > i { position: absolute; inset: 0 auto 0 0; background: linear-gradient(#ffd25e, #f08a1c); }
.dominance > span { position: relative; display: grid; place-items: center; height: 100%; font-size: 12px; font-weight: 700; color: #fff; text-shadow: 0 1px 0 #000; }
.stars { display: flex; justify-content: center; align-items: flex-end; gap: 6px; margin: -4px 0 4px; }
.star { width: 54px; height: 54px; filter: grayscale(1) brightness(1.35) opacity(0.45); }
.star.mid { width: 70px; height: 70px; }
.star :deep(.ic) { width: 100%; height: 100%; }
.star.on { animation: starpop 0.45s cubic-bezier(0.2, 1.6, 0.4, 1) both; }
@keyframes starpop {
  from { transform: scale(0.2) rotate(-40deg); filter: grayscale(1) brightness(1.35) opacity(0.45); }
  to { transform: scale(1) rotate(0); filter: drop-shadow(0 3px 0 rgba(120, 70, 0, 0.45)); }
}
.star-why { margin: 0 0 8px; color: var(--muted); font-size: 14px; }
.levelup { display: flex; align-items: center; gap: 10px; margin: 10px auto; padding: 8px 16px; max-width: 420px; border-radius: 14px; background: linear-gradient(#fff3c9, #ffe28a); border: 3px solid var(--gold); text-align: left; animation: pop 0.3s 1.3s both; }
.levelup :deep(.ic) { width: 40px; height: 40px; }
.levelup b { font-size: 20px; display: block; }
.levelup small { color: var(--wood-d); }
.rewards b { font-variant-numeric: tabular-nums; }
</style>
