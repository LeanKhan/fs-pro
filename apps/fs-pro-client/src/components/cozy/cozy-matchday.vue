<template>
  <div class="md">
    <div v-if="!matchday" class="md-empty">{{ error || 'Checking the fixture list…' }}</div>
    <template v-else>
      <div v-if="live" class="md-live">
        <span class="dotlive"></span>
        <div class="grow">
          <b>Live now: {{ live.home ? 'vs' : '@' }} {{ live.opponent.name }}</b>
          <small>Your plan is playing out</small>
        </div>
        <button class="btn primary" @click="emit('watch', live.fixtureId, live.playedAt)">Watch live</button>
      </div>

      <h4>Coming up</h4>
      <p v-if="!matchday.upcoming.length" class="sub">No matches scheduled. Book one below, or wait for the league draw.</p>
      <button v-for="f in matchday.upcoming" :key="f.fixtureId" class="md-row" @click="emit('prep', f.fixtureId)">
        <img :src="crestUrl(f.opponent.code)" alt="" width="36" height="36" @error="crestFallback($event, f.opponent.name)" />
        <div class="md-main">
          <div class="md-title">
            <span class="kind" :class="f.kind">{{ KIND[f.kind] }}</span>
            {{ f.home ? 'vs' : '@' }} {{ f.opponent.name }}
            <i v-if="f.opponent.human" class="human" title="Another manager's club">👤</i>
          </div>
          <small>Day {{ f.day }} · {{ String(f.kickoffHour ?? 20).padStart(2, '0') }}:00 · {{ f.home ? 'home' : 'away' }} · power {{ f.opponent.power }}</small>
        </div>
        <div class="md-when">
          <b v-if="secondsTo(f) !== null">{{ shortClock(secondsTo(f)!) }}</b>
          <b v-else>Day {{ f.day }}</b>
          <span class="plan" :class="{ set: f.planSet }">{{ f.planSet ? 'Plan set ✓' : 'Set plan' }}</span>
        </div>
      </button>

      <div class="md-book">
        <div>
          <b>Book a match</b>
          <small>Pick an opponent from matchmaking. Kick-off is the next cup day, so both sides get time to prepare. Pays more than a quick PLAY.</small>
        </div>
        <button class="btn" :disabled="matchday.bookings.used >= matchday.bookings.max" @click="emit('book')">
          <span v-html="icon('ball')"></span>Book ({{ matchday.bookings.used }}/{{ matchday.bookings.max }})
        </button>
      </div>

      <h4>Results</h4>
      <p v-if="!matchday.recent.length" class="sub">No scheduled matches played yet.</p>
      <div v-for="f in matchday.recent" :key="f.fixtureId" class="md-row done">
        <i class="resbox" :class="resClass(f)">{{ resLetter(f) }}</i>
        <div class="md-main">
          <div class="md-title"><span class="kind" :class="f.kind">{{ KIND[f.kind] }}</span> {{ f.score?.you }}-{{ f.score?.them }} {{ f.home ? 'vs' : '@' }} {{ f.opponent.name }}</div>
          <small>Day {{ f.day }}</small>
        </div>
        <button v-if="f.hasReplay" class="btn small" @click="emit('watch', f.fixtureId, null)">Watch</button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Matchday, MatchdayFixture } from '@repo/api-contract';
import { client } from '@/services/api';
import { crestUrl } from '@/helpers/crest';
import { crestFallback } from './club-colors';
import { icon } from './icons';

const props = defineProps<{ clubId: string; nowMs: number; refreshKey?: number }>();
const emit = defineEmits<{
  (e: 'prep', fixtureId: string): void;
  (e: 'watch', fixtureId: string, playedAt: string | null): void;
  (e: 'book'): void;
  (e: 'loaded', m: Matchday): void;
}>();

const KIND: Record<string, string> = { league: 'League', booked: 'Booked', challenge: 'Challenge', cup: 'Cup', friendly: 'Friendly' };
/** A replay counts as live while it would still be playing at 1x (~5 minutes). */
const LIVE_WINDOW_MS = 5 * 60_000;

const matchday = ref<Matchday | null>(null);
const error = ref('');
const loadedAt = ref(Date.now());
async function load() {
  const res = await client.play.getMatchday.query({ params: { clubId: props.clubId } });
  if (res.status === 200) {
    matchday.value = res.body.payload;
    loadedAt.value = Date.now();
    emit('loaded', res.body.payload);
  } else error.value = res.body.message;
}
watch(() => [props.clubId, props.refreshKey], load, { immediate: true });

const secondsTo = (f: MatchdayFixture) =>
  f.startsInSeconds === null ? null : Math.max(0, f.startsInSeconds - Math.floor((props.nowMs - loadedAt.value) / 1000));
const live = computed(
  () =>
    matchday.value?.recent.find((f) => f.hasReplay && f.playedAt && props.nowMs - Date.parse(f.playedAt) < LIVE_WINDOW_MS) ?? null
);
const resLetter = (f: MatchdayFixture) => (!f.score ? '?' : f.score.you > f.score.them ? 'W' : f.score.you < f.score.them ? 'L' : 'D');
const resClass = (f: MatchdayFixture) => `res-${resLetter(f).toLowerCase()}`;
function shortClock(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return s <= 0 ? 'now' : d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}
</script>

<style scoped>
.md { display: grid; gap: 8px; }
.md h4 { margin: 8px 0 0; }
.md-empty, .sub { color: var(--muted); font-size: 14px; margin: 0; }
.md-row { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border-radius: 14px; background: #fffaf0; border: 2px solid #eadbb8; text-align: left; }
button.md-row:hover { border-color: var(--green); }
.md-main { flex: 1; min-width: 0; }
.md-title { font-weight: 600; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.md-main small { color: var(--muted); }
.kind { padding: 0 6px; border-radius: 7px; font-size: 10px; font-weight: 700; color: #fff; background: var(--blue); text-transform: uppercase; }
.kind.league { background: var(--green-d); } .kind.booked { background: var(--gold); color: var(--wood-d); } .kind.cup { background: var(--red); }
.human { font-style: normal; font-size: 13px; }
.md-when { display: grid; justify-items: end; gap: 2px; font-variant-numeric: tabular-nums; }
.plan { font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 8px; background: #fde6e1; color: #9a2216; }
.plan.set { background: #eaf8e0; color: var(--green-d); }
.md-book { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 14px; background: linear-gradient(#fff8e6, #f6e7c4); border: 2px dashed #c9a46a; }
.md-book > div { flex: 1; display: grid; }
.md-book small { color: var(--muted); font-size: 12px; }
.resbox { flex: none; width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; color: #fff; font-style: normal; font-weight: 700; }
.md-live { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 14px; background: linear-gradient(#ffefe9, #ffd9cc); border: 3px solid var(--red); }
.md-live .grow { flex: 1; display: grid; }
.md-live small { color: #9a2216; }
.dotlive { width: 14px; height: 14px; border-radius: 50%; background: var(--red); animation: livepulse 1.2s ease-in-out infinite; }
@keyframes livepulse { 50% { transform: scale(1.4); opacity: 0.6; } }
</style>
