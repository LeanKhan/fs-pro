<template>
  <div class="result" :class="result.outcome">
    <h2>{{ { win: 'Victory!', draw: 'A hard-fought draw', loss: 'Defeat' }[result.outcome] }}</h2>
    <div class="final">
      <img :src="crestUrl(myCode)" alt="" width="48" height="48" @error="crestFallback($event, myName)" />
      <b>{{ result.score.you }} - {{ result.score.them }}</b>
      <img :src="crestUrl(result.opponent.code)" alt="" width="48" height="48" @error="crestFallback($event, result.opponent.name)" />
    </div>
    <p class="sub">{{ myName }} vs {{ result.opponent.name }}</p>
    <p v-if="result.challengeCompleted" class="warn good">Challenge complete! Reward paid.</p>
    <div class="rewards">
      <div><span v-html="icon('coins')"></span><b>{{ signed(result.rewards.cash, currency) }}</b><small>prize</small></div>
      <div v-if="result.gate"><span v-html="icon('coins')"></span><b>{{ signed(result.gate.net, currency) }}</b><small>gate ({{ result.gate.attendance.toLocaleString() }} fans)</small></div>
      <div><span v-html="icon('star')"></span><b>+{{ result.rewards.xp }}</b><small>XP</small></div>
      <template v-if="result.standingChange">
        <div><span v-html="icon('people')"></span><b>{{ signed(result.standingChange.fans) }}</b><small>fans</small></div>
        <div><span v-html="icon('star')"></span><b>{{ signed(result.standingChange.reputation) }}</b><small>reputation</small></div>
        <div><span v-html="icon('trophy')"></span><b>{{ signed(result.standingChange.boardConfidence) }}</b><small>board</small></div>
      </template>
    </div>
    <div class="row-btns">
      <button class="btn" @click="emit('close')">Back to the grounds</button>
      <button class="btn primary" @click="emit('again')">Play again</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { crestUrl } from '@/helpers/crest';
import type { MatchResult } from '@repo/api-contract';
import { currency } from '@/helpers/misc';
import { crestFallback } from './club-colors';
import { icon } from './icons';

defineProps<{ result: MatchResult; myName: string; myCode: string }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'again'): void }>();

const signed = (n: number, f: (n: number) => string = (x) => Math.round(x).toLocaleString('en-US')) =>
  `${n >= 0 ? '+' : '-'}${f(Math.abs(n))}`;
</script>
