<template>
  <div class="league">
    <template v-if="league">
      <div class="lg-head">
        <div class="lg-badge" :class="`d${Math.min(league.division, 5)}`">
          <small>DIV</small><b>{{ league.division }}</b>
        </div>
        <div class="lg-title">
          <h3>{{ league.poolName }}</h3>
          <p class="sub">
            {{ league.competitionName }} ·
            <template v-if="league.promote">top {{ league.promote }} go up</template>
            <template v-else>the top division</template>
            <template v-if="league.relegate"> · bottom {{ league.relegate }} go down</template>
          </p>
        </div>
        <div class="lg-rank">
          <small>Position</small>
          <b>{{ myPosition ? ordinal(myPosition) : '–' }}</b>
          <small>of {{ league.clubsInPool }}</small>
        </div>
      </div>

      <div class="lg-cards">
        <div v-if="league.next" class="lg-card next">
          <small>Next league match</small>
          <div class="lg-vs">
            <img :src="crestUrl(myCode)" alt="" width="40" height="40" @error="crestFallback($event, myName)" />
            <b>{{ league.next.home ? 'vs' : '@' }}</b>
            <img :src="crestUrl(league.next.opponentCode)" alt="" width="40" height="40" @error="crestFallback($event, league.next.opponentName)" />
            <div class="lg-opp">
              <b>{{ league.next.opponentName }}</b>
              <small>{{ league.next.home ? 'At your ground' : 'Away' }} · Day {{ league.next.day }}, {{ String(league.next.kickoffHour).padStart(2, '0') }}:00</small>
            </div>
          </div>
          <div class="lg-count">
            <span v-html="icon('clock')"></span>
            <template v-if="kickoffIn !== null">{{ kickoffIn > 0 ? `Kick-off in ${formatClock(kickoffIn)}` : 'Kicking off now' }}</template>
            <template v-else>World clock paused</template>
          </div>
          <div class="row-btns left">
            <button class="btn small" @click="emit('tactics')"><span v-html="icon('bag')"></span>Team sheet</button>
            <button class="btn small" @click="emit('visit', league.next.opponentId)">Scout their grounds</button>
          </div>
        </div>
        <div v-else class="lg-card next">
          <small>Next league match</small>
          <p class="sub">Your league season is done. The next draw comes at year end.</p>
        </div>
        <div v-if="league.last" class="lg-card last">
          <small>Last result</small>
          <div class="lg-last"><i :class="`res-${league.last.outcome.toLowerCase()}`">{{ league.last.outcome }}</i> {{ league.last.score }} vs {{ league.last.opponentCode }}</div>
        </div>
      </div>

      <table class="lg-table">
        <thead>
          <tr><th>#</th><th class="club">Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr>
        </thead>
        <tbody>
          <tr
            v-for="(r, i) in league.table"
            :key="r.clubId"
            :class="{ me: r.clubId === clubId, up: i < league.promote, down: i >= league.table.length - league.relegate }"
            @click="r.clubId !== clubId && emit('visit', r.clubId)"
          >
            <td>{{ i + 1 }}</td>
            <td class="club">
              <img :src="crestUrl(r.code)" alt="" width="22" height="22" @error="crestFallback($event, r.name)" />
              <span>{{ r.name }}</span>
            </td>
            <td>{{ r.played }}</td>
            <td>{{ r.wins }}</td>
            <td>{{ r.draws }}</td>
            <td>{{ r.losses }}</td>
            <td>{{ r.gd > 0 ? `+${r.gd}` : r.gd }}</td>
            <td><b>{{ r.points }}</b></td>
          </tr>
        </tbody>
      </table>
      <p class="sub small">
        League matches kick off on their own at the set hour, with your saved team sheet. PLAY matches don't count here:
        they earn cash, XP and fans.
      </p>
    </template>
    <div v-else class="lg-empty">
      <span v-html="icon('trophy')"></span>
      <p>You're not in a league this year. New clubs join their country's pyramid when the next season is drawn.</p>
    </div>
    <button class="btn" @click="emit('competitions')"><span v-html="icon('trophy')"></span>Other competitions</button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ClubLeague } from '@repo/api-contract';
import { crestUrl } from '@/helpers/crest';
import { formatClock } from '@/composables/use-club-game';
import { crestFallback } from './club-colors';
import { icon } from './icons';

const props = defineProps<{
  league: ClubLeague | null;
  clubId: string;
  myName: string;
  myCode: string;
  /** Seconds since the league data was fetched, for the countdown. */
  elapsed: number;
}>();
const emit = defineEmits<{
  (e: 'visit', clubId: string): void;
  (e: 'tactics'): void;
  (e: 'competitions'): void;
}>();

const myPosition = computed(() => {
  const i = props.league?.table.findIndex((r) => r.clubId === props.clubId) ?? -1;
  return i >= 0 ? i + 1 : null;
});
const kickoffIn = computed(() => {
  const s = props.league?.next?.startsInSeconds;
  return s === null || s === undefined ? null : Math.max(0, s - props.elapsed);
});
function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
</script>

<style scoped>
.league { display: grid; gap: 12px; }
.lg-head { display: flex; align-items: center; gap: 14px; padding: 12px; border-radius: 16px; background: #fffaf0; border: 3px solid #e2cc9c; }
.lg-title { flex: 1; min-width: 0; }
.lg-title h3 { margin: 0; font-size: 21px; }
.lg-title .sub { margin: 2px 0 0; font-size: 14px; }
.lg-badge { flex: none; width: 64px; height: 72px; display: grid; place-content: center; text-align: center; color: #fff; clip-path: polygon(50% 0, 100% 18%, 100% 72%, 50% 100%, 0 72%, 0 18%); background: linear-gradient(#b7c3cf, #7d8b99); text-shadow: 0 2px 0 rgba(0, 0, 0, 0.35); }
.lg-badge small { font-size: 11px; font-weight: 700; letter-spacing: 1px; }
.lg-badge b { font-size: 30px; line-height: 1; }
.lg-badge.d1 { background: linear-gradient(#ffe28a, #e9a91c); }
.lg-badge.d2 { background: linear-gradient(#e3e9ef, #9fb0c2); }
.lg-badge.d3 { background: linear-gradient(#f2b98a, #b8692c); }
.lg-badge.d4, .lg-badge.d5 { background: linear-gradient(#a7d98c, #4d9a2e); }
.lg-rank { display: grid; justify-items: center; padding: 6px 12px; border-radius: 12px; background: var(--cream-2); }
.lg-rank small { font-size: 11px; color: var(--muted); }
.lg-rank b { font-size: 26px; line-height: 1.1; color: var(--wood-d); }
.lg-cards { display: grid; grid-template-columns: 2fr 1fr; gap: 10px; }
.lg-card { padding: 10px 12px; border-radius: 14px; background: #fffaf0; border: 2px solid #eadbb8; }
.lg-card > small { color: var(--muted); font-weight: 600; }
.lg-vs { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.lg-vs > b { font-size: 18px; color: var(--muted); }
.lg-opp { display: grid; margin-left: 4px; min-width: 0; }
.lg-opp small { color: var(--muted); }
.lg-count { display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; padding: 3px 12px 3px 6px; border-radius: 12px; background: #fff; border: 2px solid #e2cc9c; font-weight: 600; font-variant-numeric: tabular-nums; }
.lg-count :deep(.ic) { width: 20px; height: 20px; }
.row-btns.left { justify-content: flex-start; margin-top: 10px; }
.lg-last { margin-top: 8px; font-size: 18px; font-weight: 600; }
.lg-last i { display: inline-block; width: 26px; text-align: center; border-radius: 6px; color: #fff; font-style: normal; }
.lg-table { width: 100%; border-collapse: separate; border-spacing: 0 4px; font-variant-numeric: tabular-nums; }
.lg-table th { font-size: 12px; color: var(--muted); font-weight: 600; text-align: center; padding: 0 6px; }
.lg-table td { text-align: center; padding: 6px; background: #fffaf0; border-top: 2px solid #eadbb8; border-bottom: 2px solid #eadbb8; }
.lg-table td:first-child { border-left: 2px solid #eadbb8; border-radius: 10px 0 0 10px; font-weight: 700; }
.lg-table td:last-child { border-right: 2px solid #eadbb8; border-radius: 0 10px 10px 0; }
.lg-table .club { text-align: left; }
.lg-table td.club { display: flex; align-items: center; gap: 8px; font-weight: 600; }
.lg-table td.club span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lg-table tr { cursor: pointer; }
.lg-table tr.up td:first-child { box-shadow: inset 5px 0 0 var(--green); }
.lg-table tr.down td:first-child { box-shadow: inset 5px 0 0 var(--red); }
.lg-table tr.me td { background: #fff3c9; border-color: var(--gold); }
.lg-table tr.me { cursor: default; }
.sub.small { font-size: 13px; margin: 0; }
.lg-empty { display: grid; justify-items: center; gap: 6px; padding: 24px; text-align: center; color: var(--muted); }
.lg-empty :deep(.ic) { width: 48px; height: 48px; }
.league > .btn { justify-self: start; }
@media (max-width: 760px) {
  .lg-cards { grid-template-columns: 1fr; }
  .lg-head { flex-wrap: wrap; }
  .lg-table th:nth-child(4), .lg-table td:nth-child(4), .lg-table th:nth-child(5), .lg-table td:nth-child(5), .lg-table th:nth-child(6), .lg-table td:nth-child(6) { display: none; }
}
</style>
