<template>
  <!-- The push to Level 1 -->
  <section v-if="!revealed" class="op-step">
    <header class="op-step-head">
      <div>
        <h2>The last push</h2>
        <p class="op-step-sub">One hundred XP stands between you and a real league. Wins pay 30. You need them.</p>
      </div>
      <div class="op-step-budget">
        <small>Program XP</small>
        <b>{{ programXp }}<small>/54</small></b>
      </div>
    </header>

    <div class="op-xp">
      <div class="op-xp-head">
        <span>Level 1 progress</span>
        <b>{{ xpInto }}<small> / {{ xpForNext }}</small></b>
      </div>
      <div class="op-xp-bar" role="progressbar" :aria-valuenow="xpInto" :aria-valuemin="0" :aria-valuemax="xpForNext">
        <div class="op-xp-fill" :style="{ width: `${Math.min(100, (xpInto / Math.max(1, xpForNext)) * 100)}%` }" />
      </div>
      <div class="op-xp-legend">
        <span class="op-legend win">Win +30</span>
        <span class="op-legend draw">Draw +10</span>
        <span class="op-legend loss">Loss +5</span>
      </div>
    </div>

    <ul v-if="recent.length" class="op-recent">
      <li v-for="(m, i) in recent" :key="i" :class="m.outcome">
        <span class="op-res-letter">{{ m.outcome[0].toUpperCase() }}</span>
        <span class="op-res-name">{{ m.opponent }}</span>
        <b>{{ m.score }}</b>
      </li>
    </ul>
    <p v-else class="op-empty-note">No qualifying friendlies played yet. PLAY opens once your squad is legal.</p>

    <div class="op-recover">
      <div>
        <b>Wins are the only thing that move the bar now.</b>
        <span>Every qualifying friendly pays gate money too — bank it and keep the squad fresh.</span>
      </div>
      <button class="op-btn primary" @click="emit('play')">Play a qualifying friendly</button>
    </div>
    <button class="op-btn ghost self" :disabled="busy === 'loan'" @click="emit('advance')">The board's advance</button>
  </section>

  <!-- The league draw -->
  <section v-else class="op-draw" :class="{ celebrate }">
    <div v-if="celebrate" class="op-confetti" aria-hidden="true">
      <span v-for="i in 24" :key="i" :style="{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 8) * 90}ms`, background: confettiColors[i % 4] }" />
    </div>
    <div class="op-draw-shield" aria-hidden="true">1</div>
    <p class="op-draw-kicker">Level 1</p>
    <h2 class="op-draw-title">Your league has a name now</h2>
    <template v-if="league">
      <p class="op-draw-sub">
        {{ league.competitionName }} · Division {{ league.division }} ·
        <b>{{ league.poolName }}</b>
      </p>

      <div class="op-draw-pool">
        <header>
          <span class="op-ic" v-html="icon('trophy')" />
          <b>{{ league.poolName }}</b>
          <small>{{ league.clubsInPool }} clubs</small>
        </header>
        <ul>
          <li v-for="(row, i) in league.table.slice(0, 12)" :key="row.clubId" :style="{ animationDelay: `${i * 45}ms` }">
            <span class="op-rank">{{ row.rank ?? i + 1 }}</span>
            <span class="op-club">{{ row.name }}</span>
            <b>{{ row.points }}</b>
          </li>
        </ul>
      </div>

      <div v-if="league.next" class="op-draw-fixture">
        <small>Your first fixture</small>
        <b>{{ league.next.opponentName }}</b>
        <span>{{ league.next.home ? 'at home' : 'away' }} · Day {{ league.next.day }}</span>
      </div>

      <div class="op-draw-actions">
        <button class="op-btn primary big" @click="emit('close')">Take the field</button>
      </div>
    </template>
    <p v-else class="op-draw-sub">The draw is in progress — your pool will be ready in a moment.</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import type { PlayState } from '@repo/api-contract';
import { icon } from '@/components/cozy/icons';
import { sfx } from '@/services/sfx';

const props = withDefaults(
  defineProps<{ playState: PlayState | null; programXp: number; celebrate?: boolean; busy?: string | null }>(),
  { celebrate: false, busy: null }
);
const emit = defineEmits<{ (e: 'play'): void; (e: 'advance'): void; (e: 'close'): void }>();

const confettiColors = ['#f5b82e', '#5cc23a', '#e5402f', '#3a8ee0'];

const xpInto = computed(() => Math.max(0, props.playState?.club.xpIntoLevel ?? 0));
const xpForNext = computed(() => Math.max(1, props.playState?.club.xpForNext ?? 100));
const recent = computed(() => props.playState?.recent.slice(0, 4) ?? []);
const league = computed(() => props.playState?.league ?? null);

const revealed = computed(() => (props.playState?.club.level ?? 0) >= 1 || !!league.value);

onMounted(() => {
  if (revealed.value) {
    sfx.play('levelup');
    window.setTimeout(() => sfx.play('win'), 420);
  }
});
</script>

<style scoped>
.op-step {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.op-step-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.op-step-head h2 {
  margin: 0;
  font-size: 24px;
}
.op-step-sub {
  margin: 2px 0 0;
  font-size: 14px;
  color: #6f5940;
  max-width: 560px;
}
.op-step-budget {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding: 6px 14px;
  border-radius: 12px;
  background: #f6ead0;
  border: 2px solid #e2cc9c;
}
.op-step-budget small {
  font-size: 11px;
  color: #6f5940;
}
.op-step-budget b {
  font-size: 20px;
  color: #5e3b22;
}
.op-step-budget b small {
  font-size: 12px;
  color: #6f5940;
}
.op-xp {
  padding: 14px 16px;
  border-radius: 16px;
  background: #fffaf0;
  border: 3px solid #e2cc9c;
}
.op-xp-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-weight: 700;
  font-size: 15px;
}
.op-xp-head b {
  font-size: 24px;
  color: #256b16;
  font-variant-numeric: tabular-nums;
}
.op-xp-head b small {
  font-size: 14px;
  color: #6f5940;
}
.op-xp-bar {
  height: 18px;
  margin: 8px 0;
  border-radius: 10px;
  background: #e6d8b8;
  overflow: hidden;
  border: 2px solid #d8c49a;
}
.op-xp-fill {
  height: 100%;
  background: linear-gradient(#8be15c, #46ad2a);
  transition: width 0.5s;
}
.op-xp-legend {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.op-legend {
  font-size: 12px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 9px;
  color: #fff;
}
.op-legend.win {
  background: #2f7d18;
}
.op-legend.draw {
  background: #f08a1c;
}
.op-legend.loss {
  background: #c8553f;
}
.op-recent {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.op-recent li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 12px;
  background: #fffaf0;
  border: 2px solid #eadbb8;
}
.op-res-letter {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  font-weight: 700;
  color: #fff;
  background: #c8b48c;
}
.op-recent li.win .op-res-letter {
  background: #2f7d18;
}
.op-recent li.draw .op-res-letter {
  background: #f08a1c;
}
.op-recent li.loss .op-res-letter {
  background: #c8553f;
}
.op-res-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.op-empty-note {
  margin: 0;
  padding: 16px;
  text-align: center;
  color: #6f5940;
  border: 3px dashed #d8c49a;
  border-radius: 14px;
}
.op-btn {
  font: inherit;
  font-weight: 700;
  font-size: 14px;
  padding: 9px 16px;
  border-radius: 12px;
  border: 3px solid #c39457;
  background: linear-gradient(#fffaf0, #ecdcb8);
  color: #5e3b22;
  box-shadow: 0 3px 0 rgba(70, 40, 15, 0.3);
  cursor: pointer;
  min-height: 44px;
}
.op-btn.primary {
  background: linear-gradient(#2f7d18, #24650f);
  border-color: #24650f;
  color: #fff;
}
.op-btn.big {
  font-size: 18px;
  padding: 13px 24px;
}
.op-btn.self {
  align-self: flex-start;
}
.op-btn:disabled {
  filter: grayscale(0.7);
  opacity: 0.6;
  cursor: not-allowed;
}
.op-recover {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  background: #fffaf0;
  border: 3px solid #e2cc9c;
  flex-wrap: wrap;
}
.op-recover b {
  display: block;
  font-size: 15px;
}
.op-recover span {
  font-size: 13px;
  color: #6f5940;
}

/* Draw reveal */
.op-draw {
  position: relative;
  text-align: center;
  padding: 20px 16px;
  overflow: hidden;
}
.op-draw-shield {
  width: 74px;
  height: 82px;
  margin: 0 auto;
  display: grid;
  place-items: center;
  font-size: 34px;
  font-weight: 700;
  color: #6f5010;
  background: radial-gradient(circle at 35% 30%, #ffe28a, #e9a91c);
  border: 4px solid #fff3c9;
  clip-path: polygon(50% 0, 100% 18%, 100% 70%, 50% 100%, 0 70%, 0 18%);
  box-shadow: 0 4px 0 rgba(70, 40, 15, 0.3);
  animation: op-pop 0.5s cubic-bezier(0.2, 1.6, 0.4, 1) both;
}
.op-draw-kicker {
  margin: 10px 0 0;
  text-transform: uppercase;
  letter-spacing: 2px;
  font-weight: 700;
  color: #8a6230;
}
.op-draw-title {
  margin: 2px 0 4px;
  font-size: clamp(26px, 5vw, 38px);
  color: #256b16;
}
.op-draw-sub {
  margin: 0 0 14px;
  font-size: 16px;
  color: #4a3220;
}
.op-draw-pool {
  max-width: 520px;
  margin: 0 auto;
  border-radius: 18px;
  background: #fffaf0;
  border: 3px solid #c9a46a;
  overflow: hidden;
  text-align: left;
}
.op-draw-pool header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: linear-gradient(#fff8e6, #f1dfb6);
  border-bottom: 3px solid #e2cc9c;
}
.op-draw-pool header .op-ic {
  width: 26px;
  height: 26px;
}
.op-draw-pool header b {
  flex: 1;
  font-size: 17px;
}
.op-draw-pool header small {
  color: #6f5940;
}
.op-draw-pool ul {
  list-style: none;
  margin: 0;
  padding: 6px;
  display: grid;
  gap: 4px;
}
.op-draw-pool li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 10px;
  background: #fff;
  border: 2px solid #eadbb8;
  animation: op-rise 0.4s ease-out both;
}
@keyframes op-rise {
  from {
    transform: translateY(8px);
    opacity: 0;
  }
}
.op-rank {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  font-weight: 700;
  font-size: 13px;
  background: #f6ead0;
  color: #7a4b22;
}
.op-club {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.op-draw-fixture {
  max-width: 520px;
  margin: 12px auto 0;
  padding: 12px;
  border-radius: 14px;
  background: #eaf3ff;
  border: 3px solid #cfe2fb;
  display: flex;
  flex-direction: column;
}
.op-draw-fixture small {
  font-size: 12px;
  color: #1f4f85;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.op-draw-fixture b {
  font-size: 20px;
}
.op-draw-fixture span {
  font-size: 13px;
  color: #6f5940;
}
.op-draw-actions {
  margin-top: 16px;
}
.op-confetti {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.op-confetti span {
  position: absolute;
  top: -12px;
  width: 10px;
  height: 16px;
  border-radius: 2px;
  animation: op-fall 1.8s ease-in both;
}
@keyframes op-fall {
  to {
    transform: translateY(420px) rotate(540deg);
    opacity: 0;
  }
}
@keyframes op-pop {
  from {
    transform: scale(0.4);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .op-confetti,
  .op-draw-shield {
    display: none;
  }
  .op-draw-pool li {
    animation: none;
  }
}
</style>
