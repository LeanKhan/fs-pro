<template>
  <div class="edition-timeline">
    <div class="et-scale text-caption text-medium-emphasis">
      <span v-for="t in ticks" :key="t" class="et-tick" :style="{ left: pos(t) }">{{ t }}</span>
      <span class="et-today" :style="{ left: pos(today) }" title="Today" />
    </div>
    <div v-for="row in rows" :key="row.id" class="et-row" :class="{ 'is-draft': row.draft }">
      <div class="et-label text-caption text-truncate" :title="row.title">{{ row.title }}</div>
      <div class="et-track">
        <div
          v-if="row.regFrom != null && row.regTo != null"
          class="et-bar et-reg"
          :style="bar(row.regFrom, row.regTo, row.color)"
          :title="`Registration: days ${row.regFrom}–${row.regTo}`"
        />
        <div
          v-if="row.from != null"
          class="et-bar"
          :style="bar(row.from, row.to ?? row.from + 30, row.color)"
          :title="`Play: day ${row.from}${row.to != null ? `–${row.to}` : ' onwards'}`"
        />
        <span class="et-today" :style="{ left: pos(today) }" />
      </div>
    </div>
    <div v-if="!rows.length" class="text-caption text-medium-emphasis py-2">No editions in this window.</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Edition } from '@repo/api-contract';

/** Every edition as a bar across the coming days: registration window
 * (light) then play (solid), coloured by status. An optional draft window
 * is drawn on top, to spot overlaps while scheduling a new edition. */
const props = withDefaults(
  defineProps<{
    editions: Edition[];
    today: number;
    days?: number;
    before?: number;
    draft?: { title: string; registrationOpensDay: number; registrationClosesDay: number; startDay: number } | null;
  }>(),
  { days: 60, before: 7, draft: null }
);

const COLORS: Record<string, string> = {
  draft: '#9e9e9e',
  registration: '#26a69a',
  running: '#ffb300',
  finished: '#5c6bc0',
  cancelled: '#e53935',
};

const from = computed(() => props.today - props.before);
const to = computed(() => props.today + props.days);
const span = computed(() => Math.max(1, to.value - from.value));
const clamp = (d: number) => Math.min(to.value, Math.max(from.value, d));
const pos = (d: number) => `${((clamp(d) - from.value) / span.value) * 100}%`;
function bar(a: number, b: number, color: string) {
  const l = clamp(a);
  const r = clamp(b + 1);
  return { left: pos(l), width: `${((r - l) / span.value) * 100}%`, background: color };
}
const ticks = computed(() => {
  const step = props.days > 90 ? 30 : props.days > 30 ? 10 : 5;
  const out: number[] = [];
  for (let d = Math.ceil(from.value / step) * step; d <= to.value; d += step) out.push(d);
  return out;
});

const rows = computed(() => {
  const list = props.editions
    .filter((e) => e.status !== 'cancelled' || (e.endDay ?? e.startDay ?? 0) >= from.value)
    .filter((e) => (e.endDay ?? Infinity) >= from.value && (e.registrationOpensDay ?? e.startDay ?? 0) <= to.value)
    .sort((a, b) => (a.registrationOpensDay ?? a.startDay ?? 0) - (b.registrationOpensDay ?? b.startDay ?? 0))
    .map((e) => ({
      id: e.id,
      title: e.title,
      regFrom: e.registrationOpensDay,
      regTo: e.registrationClosesDay,
      from: e.startDay,
      to: e.endDay,
      color: COLORS[e.status] ?? '#9e9e9e',
      draft: false,
    }));
  if (props.draft)
    list.unshift({
      id: 'draft',
      title: props.draft.title,
      regFrom: props.draft.registrationOpensDay,
      regTo: props.draft.registrationClosesDay,
      from: props.draft.startDay,
      to: null,
      color: '#ab47bc',
      draft: true,
    });
  return list;
});
</script>

<style scoped>
.edition-timeline {
  --label: 140px;
}
.et-scale {
  position: relative;
  height: 18px;
  margin-left: var(--label);
}
.et-tick {
  position: absolute;
  transform: translateX(-50%);
}
.et-row {
  display: flex;
  align-items: center;
  height: 22px;
}
.et-row.is-draft .et-label {
  font-weight: 700;
  color: #ce93d8;
}
.et-label {
  width: var(--label);
  flex: none;
  padding-right: 8px;
}
.et-track {
  position: relative;
  flex: 1;
  height: 12px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
}
.et-bar {
  position: absolute;
  top: 0;
  height: 100%;
  border-radius: 6px;
}
.et-reg {
  opacity: 0.35;
}
.et-today {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 2px;
  background: #ffd54f;
}
.et-scale .et-today {
  top: 0;
  height: 100%;
}
</style>
