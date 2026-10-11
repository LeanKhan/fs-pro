<template>
  <h2><span v-html="icon('ball')"></span> Attack</h2>
  <p class="sub">Pick a club to attack. Their saved grid defends. Win stars to take a share of their Cash, Fans and Tokens, and climb the ladder.</p>
  <div class="stats-row">
    <div><small>Your power</small><b>{{ myPower }}</b></div>
  </div>
  <div v-if="squadIssue" class="warn">
    {{ squadIssue }}
    <span class="row-btns"><button class="btn small" @click="emit('squad')">Squad</button></span>
  </div>
  <p v-if="searching" class="sub">Looking for opponents near your power…</p>
  <div v-else class="opps">
    <div v-for="o in opponents" :key="o.id" class="opp" :class="[label(o.power).toLowerCase(), { picked: o.id === selectedId, human: o.human }]" @click="emit('select', o)">
      <span class="opp-label">{{ label(o.power) }}</span>
      <span v-if="o.human" class="opp-human" :title="`${o.manager}'s saved team sheet will defend`"><span v-html="icon('people')"></span>{{ o.manager }}</span>
      <img :src="crestUrl(o.code)" :alt="o.name" width="56" height="56" @error="crestFallback($event, o.name)" />
      <div class="opp-name">{{ o.name }}</div>
      <div class="opp-meta">Power {{ o.power }}<template v-if="o.standing !== undefined"> · <span v-html="icon('trophy')" class="mini"></span>{{ o.standing }}</template></div>
      <div v-if="o.loot" class="opp-loot" title="What a 3-star win would take">
        <small>Available loot</small>
        <span><span v-html="icon('coins')"></span>{{ currency(o.loot.cash) }}</span>
        <span><span v-html="icon('people')"></span>{{ Math.round(o.loot.fans).toLocaleString('en-US') }}</span>
        <span v-if="o.loot.tokens"><span v-html="icon('star')"></span>{{ o.loot.tokens }}</span>
      </div>
      <div class="opp-links">
        <router-link class="opp-meta" :to="`/game/${o.id}`">Visit grounds</router-link>
        <button class="opp-meta scout-link" @click.stop="emit('scout', o)">Scout setup</button>
      </div>
      <div class="opp-btns">
        <button class="btn primary" :disabled="starting || (cooldown ?? 0) > 0" @click.stop="emit('select', o), emit('play')">
          {{ starting && o.id === selectedId ? 'Starting…' : (cooldown ?? 0) > 0 ? 'Resting' : 'Attack' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { crestUrl } from '@/helpers/crest';
import { currency } from '@/helpers/misc';
type Opponent = {
  id: string;
  name: string;
  power: number;
  code?: string;
  human?: boolean;
  manager?: string | null;
  loot?: { cash: number; fans: number; tokens: number };
  standing?: number;
};
import { crestFallback } from './club-colors';
import { icon } from './icons';

const props = defineProps<{
  myPower: number;
  opponents: Opponent[];
  selectedId: string | null;
  searching: boolean;
  starting: boolean;
  /** Why the squad may struggle (empty XI slots, injuries); the engine still fills gaps. */
  squadIssue?: string | null;
  /** Seconds of rest left before playing now. */
  cooldown?: number;
}>();
const emit = defineEmits<{
  (e: 'select', o: Opponent): void;
  (e: 'play'): void;
  (e: 'scout', o: Opponent): void;
  (e: 'squad'): void;
}>();

/** Same bands as before: more than 5 power either side is lopsided. */
const label = (power: number) => (power - props.myPower < -5 ? 'Favoured' : power - props.myPower > 5 ? 'Challenger' : 'Even');
</script>

<style scoped>
.opp-btns { display: flex; gap: 6px; width: 100%; margin-top: 6px; }
.opp-loot {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 4px 10px;
  margin-top: 4px;
  padding: 4px 8px;
  border-radius: 10px;
  background: #fff8e6;
  border: 2px solid #e2cc9c;
  font-weight: 700;
  font-size: 13px;
  color: var(--wood-d);
}
.opp-loot small {
  width: 100%;
  text-align: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
}
.opp-loot span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.opp-loot :deep(.ic),
.mini :deep(.ic) {
  width: 16px;
  height: 16px;
}
.mini {
  display: inline-flex;
  vertical-align: -3px;
}
.opp-btns .btn { flex: 1; margin-top: 0; }
.opp.human {
  border-color: var(--gold);
  background: linear-gradient(#fffaf0, #fff1c4);
}
.opp-human {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px 1px 2px;
  border-radius: 10px;
  background: #fff;
  border: 2px solid var(--gold);
  font-size: 12px;
  font-weight: 700;
  color: var(--wood-d);
}
.opp-human :deep(.ic) {
  width: 18px;
  height: 18px;
}
.opp-links {
  display: flex;
  gap: 6px;
  align-items: center;
}
.opp-links .scout-link {
  font-weight: 700;
  color: var(--wood-d);
  text-decoration: underline;
}
</style>
