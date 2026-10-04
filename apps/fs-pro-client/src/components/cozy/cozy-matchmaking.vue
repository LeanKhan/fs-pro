<template>
  <h2><span v-html="icon('ball')"></span> Find a Match</h2>
  <div class="stats-row">
    <div><small>Your power</small><b>{{ myPower }}</b></div>
    <div v-if="tactics"><small>Team sheet</small><b>{{ tactics.formationLabel }}</b></div>
    <div v-if="tactics"><small>Starters</small><b>{{ tactics.filledCount }}/11</b></div>
  </div>
  <div v-if="tactics && !tactics.ready" class="warn">
    {{ tactics.issues.join(' · ') }}. The engine fills gaps automatically.
    <span class="row-btns">
      <button class="btn small" @click="emit('tactics')">Team sheet</button>
      <button v-if="tactics.issues.some((i) => i.includes('injured'))" class="btn small" @click="emit('medical')">Medical</button>
    </span>
  </div>
  <p v-if="searching" class="sub">Looking for opponents near your power…</p>
  <div v-else class="opps">
    <div v-for="o in opponents" :key="o.id" class="opp" :class="[label(o.power).toLowerCase(), { picked: o.id === selectedId }]" @click="emit('select', o)">
      <span class="opp-label">{{ label(o.power) }}</span>
      <img :src="`/club-icons/${o.code}.svg`" :alt="o.name" width="56" height="56" @error="crestFallback($event, o.name)" />
      <div class="opp-name">{{ o.name }}</div>
      <div class="opp-meta">Power {{ o.power }}</div>
      <router-link class="opp-meta" :to="`/game/${o.id}`">Visit grounds</router-link>
      <button class="btn primary" :disabled="starting" @click.stop="emit('select', o), emit('play')">{{ starting && o.id === selectedId ? 'Starting…' : 'Play' }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
type Opponent = { id: string; name: string; power: number; code?: string };
import { crestFallback } from './club-colors';
import { icon } from './icons';

const props = defineProps<{
  myPower: number;
  opponents: Opponent[];
  selectedId: string | null;
  searching: boolean;
  starting: boolean;
  tactics: { formationLabel: string; filledCount: number; issues: string[]; ready: boolean } | null;
}>();
const emit = defineEmits<{
  (e: 'select', o: Opponent): void;
  (e: 'play'): void;
  (e: 'tactics'): void;
  (e: 'medical'): void;
}>();

/** Same bands as before: more than 5 power either side is lopsided. */
const label = (power: number) => (power - props.myPower < -5 ? 'Favoured' : power - props.myPower > 5 ? 'Challenger' : 'Even');
</script>
