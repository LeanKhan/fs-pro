<template>
  <div class="cozy op">
    <div class="op-bg" aria-hidden="true">
      <span class="op-cloud c1" />
      <span class="op-cloud c2" />
      <span class="op-hill" />
    </div>

    <header class="op-head">
      <div class="op-crest" aria-hidden="true">{{ initials }}</div>
      <div class="op-head-id">
        <b>Owner's Program</b>
        <span>{{ clubName }}<template v-if="clubCode"> · {{ clubCode }}</template></span>
      </div>
      <div class="op-head-xp" :title="`Program XP: ${programXp} of 54`">
        <small>Program XP</small>
        <b>{{ programXp }}<small>/54</small></b>
        <span class="op-xp-mini"><i :style="{ width: `${Math.min(100, (programXp / 54) * 100)}%` }" /></span>
      </div>
      <div class="op-head-cash">
        <small>Budget</small>
        <b>{{ formatVilla(budget) }}</b>
      </div>
      <button class="op-close" aria-label="Back to the grounds" @click="emit('close')" v-html="icon('close')" />
    </header>

    <program-rail :step="step" :step-stars="stepStars" :step-index="stepIndex" />

    <div class="op-body">
      <program-advisor-note v-if="advisor" :line="advisor" />
      <slot />
    </div>

    <div v-if="toast" class="op-toast" :class="{ bad: toast.bad }" role="status">{{ toast.text }}</div>

    <!-- Star reveal per step (rule: stars are decision quality) -->
    <div v-if="reveal" class="op-reveal" role="dialog" aria-modal="true" aria-label="Step complete">
      <div class="op-reveal-card">
        <p class="op-reveal-kicker">Step complete</p>
        <h3>{{ stepLabel(reveal.step) }}</h3>
        <program-stars :stars="reveal.stars" size="lg" />
        <p class="op-reveal-xp">+{{ reveal.xp }} program XP</p>
        <ul v-if="reveal.reasons.length" class="op-reveal-why">
          <li v-for="(r, i) in reveal.reasons" :key="i">{{ r }}</li>
        </ul>
        <button class="op-btn primary big" @click="emit('continue')">Continue</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import '@/components/cozy/cozy.scss';
import { formatVilla, type AdvisorLine } from '@repo/api-contract';
import { icon } from '@/components/cozy/icons';
import { PROGRAM_STEPS, type CompletedStep } from '@/composables/use-owner-program';
import ProgramRail from './program-rail.vue';
import ProgramAdvisorNote from './program-advisor-note.vue';
import ProgramStars from './program-stars.vue';

const props = defineProps<{
  clubName: string;
  clubCode?: string;
  step: string;
  stepStars: Record<string, number>;
  stepIndex: number;
  budget: number;
  programXp: number;
  advisor: AdvisorLine | null;
  toast: { text: string; bad: boolean } | null;
  reveal: CompletedStep | null;
}>();

const emit = defineEmits<{ (e: 'close'): void; (e: 'continue'): void }>();

const initials = computed(() => (props.clubCode || props.clubName || 'FC').slice(0, 3).toUpperCase());

function stepLabel(step: string): string {
  return PROGRAM_STEPS.find((s) => s.key === step)?.label ?? 'Step complete';
}
</script>

<style scoped>
.op {
  --op-cream: #fdf4df;
  --op-cream-2: #f6e7c4;
  --op-wood: #8a5a3b;
  --op-wood-d: #5e3b22;
  --op-ink: #4a3220;
  --op-muted: #6f5940;
  --op-green: #5cc23a;
  --op-green-d: #256b16;
  --op-red: #e5402f;
  --op-gold: #f5b82e;
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--op-ink);
  background: linear-gradient(#bfe4ff 0%, #e8f4ff 42%, #fdf4df 68%, #f6e7c4 100%);
}
.op-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.op-cloud {
  position: absolute;
  top: 40px;
  width: 120px;
  height: 40px;
  border-radius: 40px;
  background: rgba(255, 255, 255, 0.8);
  filter: blur(1px);
}
.op-cloud::before,
.op-cloud::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  background: inherit;
}
.op-cloud::before {
  width: 54px;
  height: 54px;
  left: 16px;
  top: -22px;
}
.op-cloud::after {
  width: 44px;
  height: 44px;
  right: 18px;
  top: -16px;
}
.op-cloud.c1 {
  left: 8%;
  animation: op-drift 40s linear infinite alternate;
}
.op-cloud.c2 {
  right: 12%;
  top: 90px;
  transform: scale(0.8);
  animation: op-drift 55s linear infinite alternate-reverse;
}
@keyframes op-drift {
  to {
    transform: translateX(60px);
  }
}
.op-hill {
  position: absolute;
  left: -10%;
  right: -10%;
  bottom: -60px;
  height: 220px;
  border-radius: 50% 50% 0 0;
  background: linear-gradient(#8bd06a, #5aa63e);
}
.op-head {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 52px 12px 14px;
  background: linear-gradient(#fff8e6, #f1dfb6);
  border-bottom: 3px solid #c9a46a;
  box-shadow: 0 3px 10px rgba(40, 25, 10, 0.15);
}
.op-crest {
  width: 46px;
  height: 50px;
  flex: none;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 16px;
  color: #fff;
  background: linear-gradient(#2f6fb0, #1f4f85);
  border: 3px solid #f3d27a;
  border-radius: 10px 10px 16px 16px;
}
.op-head-id {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}
.op-head-id b {
  font-size: 20px;
}
.op-head-id span {
  font-size: 13px;
  color: var(--op-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.op-head-xp,
.op-head-cash {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding: 4px 12px;
  border-radius: 12px;
  background: #fffaf0;
  border: 2px solid #e2cc9c;
}
.op-head-xp small,
.op-head-cash small {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--op-muted);
}
.op-head-xp b {
  font-size: 18px;
  color: var(--op-wood-d);
}
.op-head-xp b small {
  font-size: 11px;
  color: var(--op-muted);
}
.op-head-cash b {
  font-size: 18px;
  color: var(--op-green-d);
}
.op-xp-mini {
  display: block;
  width: 80px;
  height: 6px;
  margin-top: 2px;
  border-radius: 4px;
  background: #e6d8b8;
  overflow: hidden;
}
.op-xp-mini i {
  display: block;
  height: 100%;
  background: linear-gradient(#8be15c, #46ad2a);
}
.op-close {
  position: absolute;
  top: 50%;
  right: 12px;
  transform: translateY(-50%);
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: #fffaf0;
  border: 3px solid #c39457;
  color: var(--op-wood-d);
  cursor: pointer;
}
.op-close :deep(svg) {
  width: 22px;
  height: 22px;
}
.op-body {
  position: relative;
  z-index: 2;
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 14px 16px 28px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 1080px;
  width: 100%;
  margin: 0 auto;
}
.op-toast {
  position: fixed;
  top: 84px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 60;
  padding: 10px 18px;
  border-radius: 14px;
  background: var(--op-cream);
  border: 3px solid var(--op-green);
  font-weight: 700;
  box-shadow: 0 4px 14px rgba(40, 25, 10, 0.25);
  max-width: calc(100vw - 32px);
  text-align: center;
  animation: op-toast-in 0.22s ease-out;
}
.op-toast.bad {
  border-color: var(--op-red);
  color: #9a2216;
}
@keyframes op-toast-in {
  from {
    transform: translate(-50%, -8px);
    opacity: 0;
  }
}
.op-reveal {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: grid;
  place-items: center;
  background: rgba(40, 25, 10, 0.5);
  padding: 16px;
}
.op-reveal-card {
  width: min(420px, 100%);
  text-align: center;
  padding: 24px;
  border-radius: 22px;
  background: var(--op-cream);
  border: 4px solid #c9a46a;
  box-shadow: 0 10px 30px rgba(40, 25, 10, 0.4);
  animation: op-pop 0.3s cubic-bezier(0.2, 1.6, 0.4, 1) both;
}
@keyframes op-pop {
  from {
    transform: scale(0.8);
    opacity: 0;
  }
}
.op-reveal-kicker {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 2px;
  font-weight: 700;
  font-size: 12px;
  color: #8a6230;
}
.op-reveal-card h3 {
  margin: 2px 0 12px;
  font-size: 26px;
}
.op-reveal-card :deep(.op-stars) {
  justify-content: center;
}
.op-reveal-xp {
  margin: 12px 0 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--op-green-d);
}
.op-reveal-why {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: grid;
  gap: 4px;
  font-size: 13px;
  color: var(--op-muted);
}
.op-btn {
  font: inherit;
  font-weight: 700;
  font-size: 14px;
  padding: 9px 16px;
  border-radius: 12px;
  border: 3px solid #c39457;
  background: linear-gradient(#fffaf0, #ecdcb8);
  color: var(--op-wood-d);
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
  padding: 13px 28px;
  margin-top: 16px;
}
@media (max-width: 760px) {
  .op-head {
    flex-wrap: wrap;
    padding-right: 48px;
  }
  .op-head-id b {
    font-size: 17px;
  }
  .op-head-cash {
    display: none;
  }
  .op-body {
    padding: 12px 10px 24px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .op-cloud,
  .op-reveal-card {
    animation: none;
  }
}
</style>
