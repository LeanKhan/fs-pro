<template>
  <div class="op-meter" :class="{ legal: legal }">
    <div class="op-meter-head">
      <span class="op-meter-title">Minimum matchday squad</span>
      <b class="op-meter-count">{{ players }}<small>/{{ target }}</small></b>
    </div>
    <div class="op-meter-bar" role="progressbar" :aria-valuenow="players" :aria-valuemin="0" :aria-valuemax="target">
      <div class="op-meter-fill" :style="{ width: `${Math.min(100, (players / target) * 100)}%` }" />
    </div>
    <ul class="op-meter-list">
      <li :class="{ ok: manager }">
        <span class="op-check" v-html="icon(manager ? 'check' : 'alert')" />
        A manager
      </li>
      <li :class="{ ok: players >= target }">
        <span class="op-check" v-html="icon(players >= target ? 'check' : 'alert')" />
        {{ players }} of {{ target }} players
      </li>
      <li :class="{ ok: gk >= 1 }">
        <span class="op-check" v-html="icon(gk >= 1 ? 'check' : 'alert')" />
        {{ gk }} goalkeeper{{ gk === 1 ? '' : 's' }}
      </li>
    </ul>
    <p class="op-meter-note">
      {{ legal ? 'Legal XI — PLAY is open.' : needed > 0 ? `Sign ${needed} more to open PLAY.` : 'Add a keeper to open PLAY.' }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { icon } from '@/components/cozy/icons';

const props = withDefaults(
  defineProps<{ manager: boolean; players: number; gk: number; needed: number; target?: number }>(),
  { target: 11 }
);
const legal = computed(() => props.manager && props.players >= props.target && props.gk >= 1);
</script>

<style scoped>
.op-meter {
  padding: 14px 16px;
  border-radius: 16px;
  background: #fffaf0;
  border: 3px solid #e2cc9c;
}
.op-meter.legal {
  background: #f1fae6;
  border-color: #bfe3a5;
}
.op-meter-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.op-meter-title {
  font-weight: 700;
  font-size: 15px;
}
.op-meter-count {
  font-size: 30px;
  font-variant-numeric: tabular-nums;
  color: #5e3b22;
}
.op-meter-count small {
  font-size: 15px;
  color: #6f5940;
}
.op-meter-bar {
  height: 12px;
  margin: 8px 0 10px;
  border-radius: 8px;
  background: #e6d8b8;
  overflow: hidden;
}
.op-meter-fill {
  height: 100%;
  border-radius: 8px;
  background: linear-gradient(#8be15c, #46ad2a);
  transition: width 0.4s;
}
.op-meter-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 4px;
  font-size: 14px;
}
.op-meter-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #9a2216;
}
.op-meter-list li.ok {
  color: #256b16;
}
.op-check {
  width: 18px;
  height: 18px;
  display: inline-flex;
}
.op-check :deep(svg) {
  width: 100%;
  height: 100%;
}
.op-meter-note {
  margin: 8px 0 0;
  font-size: 13px;
  color: #6f5940;
}
</style>
