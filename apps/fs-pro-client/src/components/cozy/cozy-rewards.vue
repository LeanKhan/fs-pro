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
    <div v-if="levelReached" class="levelup">
      <span v-html="icon('star')"></span>
      <div><b>Level {{ levelReached }}!</b><small>Your club grew. New upgrades and competitions may be open.</small></div>
    </div>
    <p v-if="result.challengeCompleted" class="warn good">Challenge complete! Reward paid.</p>
    <div class="rewards">
      <div><span v-html="icon('coins')"></span><b>{{ signed(shown(result.rewards.cash), currency) }}</b><small>prize</small></div>
      <div v-if="result.gate"><span v-html="icon('coins')"></span><b>{{ signed(shown(result.gate.net), currency) }}</b><small>gate ({{ result.gate.attendance.toLocaleString() }} fans)</small></div>
      <div><span v-html="icon('star')"></span><b>+{{ Math.round(shown(result.rewards.xp)) }}</b><small>XP</small></div>
      <template v-if="result.standingChange">
        <div><span v-html="icon('people')"></span><b>{{ signed(shown(result.standingChange.fans)) }}</b><small>fans</small></div>
        <div><span v-html="icon('star')"></span><b>{{ signed(shown(result.standingChange.reputation)) }}</b><small>reputation</small></div>
        <div><span v-html="icon('trophy')"></span><b>{{ signed(shown(result.standingChange.boardConfidence)) }}</b><small>board</small></div>
      </template>
    </div>
    <div class="row-btns">
      <button class="btn" @click="emit('close')">Back to the grounds</button>
      <button class="btn primary" :disabled="cooldown > 0" @click="emit('again')">
        {{ cooldown > 0 ? `Squad resting ${formatClock(cooldown)}` : 'Play again' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { MatchResult } from '@repo/api-contract';
import { crestUrl } from '@/helpers/crest';
import { currency } from '@/helpers/misc';
import { formatClock } from '@/composables/use-club-game';
import { sfx } from '@/services/sfx';
import { crestFallback } from './club-colors';
import { icon } from './icons';

const props = defineProps<{ result: MatchResult; myName: string; myCode: string; cooldown: number; levelReached?: number | null }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'again'): void }>();

/** CoC-style stars (docs/CORE-LOOP.md): draw 1, win 2, a win by two or with
 * a clean sheet 3. Presentation only - rewards come from the server. */
const stars = computed(() => {
  const { you, them } = props.result.score;
  if (you < them) return 0;
  if (you === them) return 1;
  return you - them >= 2 || them === 0 ? 3 : 2;
});
const starWhy = computed(() =>
  [
    'Win to earn stars.',
    'A draw is one star. Win for more.',
    'Win by two, or keep a clean sheet, for the third star.',
    props.result.score.them === 0 ? 'A clean-sheet win. Three stars!' : 'A commanding win. Three stars!',
  ][stars.value]
);

// Spoils count up from zero.
const progress = ref(0);
let raf = 0;
const shown = (n: number) => n * progress.value;
onMounted(() => {
  sfx.play(props.result.outcome === 'win' ? 'win' : props.result.outcome === 'draw' ? 'draw' : 'loss');
  for (let i = 0; i < stars.value; i++) sfx.play('star', 250 + i * 350);
  if (props.levelReached) sfx.play('levelup', 1300);
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
