<template>
  <nav class="op-rail" aria-label="Owner program steps">
    <div
      v-for="(s, i) in PROGRAM_STEPS"
      :key="s.key"
      class="op-node"
      :class="{ done: isDone(s.key, i), current: s.key === step, locked: !isDone(s.key, i) && s.key !== step }"
    >
      <div class="op-node-dot">
        <span v-if="isDone(s.key, i)" class="op-ic" v-html="icon('check')" />
        <span v-else class="op-node-num">{{ i + 1 }}</span>
      </div>
      <div class="op-node-text">
        <b>{{ s.label }}</b>
        <small>{{ s.blurb }}</small>
        <program-stars v-if="isDone(s.key, i) && stepStars[s.key]" :stars="stepStars[s.key]" size="sm" />
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { icon } from '@/components/cozy/icons';
import { PROGRAM_STEPS } from '@/composables/use-owner-program';
import ProgramStars from './program-stars.vue';

const props = defineProps<{
  step: string;
  stepStars: Record<string, number>;
  /** Order value of the current step (manager=0 … done=4). */
  stepIndex: number;
}>();

/** A step is done when it is behind the current step, or it has stars. */
function isDone(key: string, i: number): boolean {
  return !!props.stepStars[key] || props.stepIndex > i;
}
</script>

<style scoped>
.op-rail {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 4px 2px 8px;
}
.op-rail::-webkit-scrollbar {
  display: none;
}
.op-node {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 0 auto;
  min-width: 150px;
  padding: 8px 12px;
  border-radius: 14px;
  background: #fffaf0;
  border: 3px solid #e2cc9c;
}
.op-node.done {
  background: #f1fae6;
  border-color: #bfe3a5;
}
.op-node.current {
  border-color: #f0a500;
  background: #fff7dc;
  box-shadow: 0 0 0 3px rgba(240, 165, 0, 0.18);
}
.op-node.locked {
  opacity: 0.72;
}
.op-node-dot {
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-weight: 700;
  color: #fff;
  background: #c8b48c;
  border: 2px solid #a4895a;
}
.op-node.done .op-node-dot {
  background: linear-gradient(#2f7d18, #24650f);
  border-color: #24650f;
}
.op-node.current .op-node-dot {
  background: linear-gradient(#ffc94a, #f08a1c);
  border-color: #b97f0f;
}
.op-node-num {
  font-size: 15px;
}
.op-node-dot .op-ic :deep(svg) {
  width: 18px;
  height: 18px;
}
.op-node-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}
.op-node-text b {
  font-size: 15px;
}
.op-node-text small {
  font-size: 11px;
  color: #6f5940;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.op-node.current .op-node-text small {
  color: #6f5940;
}
</style>
