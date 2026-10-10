<template>
  <section class="dib">
    <div v-if="loading && !inbox && !log" class="dib-state">Loading the inbox…</div>
    <div v-else-if="error && !inbox" class="dib-state bad" role="alert">
      <p>{{ error }}</p>
      <button class="btn small" @click="load">Try again</button>
    </div>

    <template v-else>
      <header class="dib-head">
        <h2><span class="ic" v-html="icon('mail')"></span> Defence inbox</h2>
        <button
          class="btn small"
          :disabled="!unread || marking"
          @click="markRead"
        >
          {{ marking ? 'Marking…' : unread ? `Mark all read (${unread})` : 'All read' }}
        </button>
      </header>

      <!-- Raid results: the durable defense log (02 §E). -->
      <div class="dib-card">
        <h3>Raid results</h3>
        <ul class="dib-list">
          <li v-for="d in defenses" :key="d.raidId" class="dib-row">
            <div class="row-top">
              <b>{{ d.headline }}</b>
              <span class="chip" :class="d.outcome">{{ d.outcomeLabel }}</span>
            </div>
            <div class="row-meta">
              <span>{{ d.attackerName }}<template v-if="d.attackerCode"> ({{ d.attackerCode }})</template></span>
              <span v-if="d.practice">practice</span>
              <span v-if="d.hasLoot" class="loot">Lost {{ lootText(d) }}</span>
              <span v-else class="safe">Nothing stolen</span>
            </div>
            <div v-if="log" class="row-meta timers">
              <cozy-countdown
                v-if="d.guardUntil"
                :at="d.guardUntil"
                :server-now="log.now"
                label="Warm-up Guard"
              />
              <cozy-countdown
                v-else-if="d.shieldUntil"
                :at="d.shieldUntil"
                :server-now="log.now"
                label="Rest Window"
              />
            </div>
          </li>
          <li v-if="!defenses.length" class="dib-empty">
            No one has raided your ground yet.
          </li>
        </ul>
      </div>

      <!-- Replays: the club's played fixtures, server-authoritative via the
           existing Matchzone replay path. -->
      <div class="dib-card">
        <h3>Replays</h3>
        <ul class="dib-list">
          <li v-for="f in replays" :key="f.fixtureId" class="dib-row">
            <div class="row-top">
              <b>{{ f.home ? 'vs' : '@' }} {{ f.opponent.name }}</b>
              <span v-if="f.score" class="score">{{ f.score.you }}–{{ f.score.them }}</span>
            </div>
            <div class="row-meta">
              <span>{{ f.title }}</span>
              <button class="btn tiny" @click="emit('replay', f.fixtureId, f.playedAt)">
                Watch replay
              </button>
            </div>
          </li>
          <li v-if="!replays.length" class="dib-empty">
            No replays saved yet. Play a match to record one.
          </li>
        </ul>
      </div>

      <!-- The club inbox: board/fans/squad reaction to results. -->
      <div class="dib-card">
        <h3>Messages</h3>
        <ul class="dib-list">
          <li
            v-for="m in messages"
            :key="m.id"
            class="dib-row"
            :class="[m.tone, { unread: !m.read }]"
          >
            <div class="row-top">
              <b>{{ m.title }}</b>
              <span class="kind">{{ m.kind }}</span>
            </div>
            <p class="body">{{ m.body }}</p>
          </li>
          <li v-if="!messages.length" class="dib-empty">No messages.</li>
        </ul>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { DefenseLog, Inbox, Matchday, MatchdayFixture } from '@repo/api-contract';
import { client } from '@/services/api';
import { payloadOrNull } from '@/helpers/envelope';
import { currency } from '@/helpers/misc';
import {
  defenseViews,
  inboxView,
  unreadCount,
  type DefenseView,
} from '@/helpers/defense-inbox';
import { realtime } from '@/services/realtime';
import { icon } from './icons';
import CozyCountdown from './cozy-countdown.vue';

/**
 * The defense inbox + replay surface (docs/coc-mapping/08 §6.1, 02 §E, OW-N09).
 *
 * It surfaces `play.getInbox` (the board/fans/dressing-room reaction) and
 * `play.defenseLog` (each resolved raid against this club: "You were raided
 * 1–2, 1★", the loot lost, and the Rest Window / Warm-up Guard countdowns), lets
 * the owner `play.markInboxRead`, and lists the club's played fixtures so a
 * resolved raid/match can be watched through the existing Matchzone replay path
 * (server-authoritative: the fixture's packed frames are fetched by the viewer).
 *
 * A `raid:resolved` realtime event refreshes the inbox over the club's private
 * topic. Plain HTML/CSS + cozy tokens; no Vuetify.
 */
const props = defineProps<{ clubId: string }>();
const emit = defineEmits<{
  (e: 'toast', text: string, level?: 'success' | 'error'): void;
  (e: 'replay', fixtureId: string, playedAt: string | null): void;
}>();

const inbox = ref<Inbox | null>(null);
const log = ref<DefenseLog | null>(null);
const matchday = ref<Matchday | null>(null);
const loading = ref(false);
const marking = ref(false);
const error = ref('');

const defenses = computed<DefenseView[]>(() =>
  log.value ? defenseViews(log.value) : []
);
const messages = computed(() => (inbox.value ? inboxView(inbox.value).messages : []));
const unread = computed(() => (inbox.value ? unreadCount(inbox.value) : 0));
const replays = computed<MatchdayFixture[]>(
  () => matchday.value?.recent.filter((f) => f.hasReplay) ?? []
);

function lootText(d: DefenseView): string {
  return d.lootParts
    .map((p) => (p.key === 'cash' ? currency(p.amount) : Math.floor(p.amount).toLocaleString('en-US')))
    .join(' · ');
}

async function load() {
  if (!props.clubId) return;
  loading.value = true;
  error.value = '';
  const [i, d, m] = await Promise.all([
    client.play.getInbox.query({ params: { clubId: props.clubId } }),
    client.play.defenseLog.query({ params: { clubId: props.clubId } }),
    client.play.getMatchday.query({ params: { clubId: props.clubId } }),
  ]);
  const nextInbox = payloadOrNull<Inbox>(i);
  const nextLog = payloadOrNull<DefenseLog>(d);
  if (nextInbox) inbox.value = nextInbox;
  if (nextLog) log.value = nextLog;
  const nextMatchday = payloadOrNull<Matchday>(m);
  if (nextMatchday) matchday.value = nextMatchday;
  if (!nextInbox && !nextLog) error.value = 'Could not load the inbox.';
  loading.value = false;
}

async function markRead() {
  if (!props.clubId || marking.value) return;
  marking.value = true;
  const res = await client.play.markInboxRead.mutation({
    params: { clubId: props.clubId },
    body: {},
  });
  const next = payloadOrNull<Inbox>(res);
  if (next) {
    inbox.value = next;
    emit('toast', 'Inbox marked read.');
  } else {
    emit('toast', 'Could not mark the inbox read.', 'error');
  }
  marking.value = false;
}

/** A resolved raid arrived on the club's private topic: refresh (19 OW-P19). */
function onRaidResolved() {
  void load();
}

onMounted(() => {
  void load();
  realtime.on('raid:resolved', onRaidResolved);
  realtime.join(`club:${props.clubId}`);
});
onUnmounted(() => {
  realtime.off('raid:resolved', onRaidResolved);
  realtime.leave(`club:${props.clubId}`);
});
</script>

<style scoped>
.dib {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: var(--ink, #4a3220);
  font-family: 'Fredoka', system-ui, sans-serif;
}
.dib-state {
  padding: 20px;
  text-align: center;
}
.dib-state.bad {
  color: var(--red, #e5402f);
}
.dib-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.dib-head h2 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 20px;
}
.dib-head .ic {
  width: 24px;
  height: 24px;
}
.dib-card {
  padding: 12px;
  border-radius: 14px;
  background: #fffaf0;
  border: 3px solid #e2cc9c;
}
.dib-card h3 {
  margin: 0 0 8px;
  font-size: 16px;
}
.dib-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dib-row {
  padding: 8px 10px;
  border-radius: 11px;
  background: #fffdf7;
  border: 2px solid #eadbb8;
}
.dib-row.good {
  border-left: 5px solid var(--green, #5cc23a);
}
.dib-row.bad {
  border-left: 5px solid var(--red, #e5402f);
}
.dib-row.unread {
  background: #fff6e2;
}
.row-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.row-top b {
  font-size: 14px;
}
.row-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 4px;
  font-size: 12px;
  color: var(--muted, #6f5940);
}
.row-meta .loot {
  color: #7a2015;
  font-weight: 700;
}
.row-meta .safe {
  color: var(--green-d, #2f8a1c);
  font-weight: 700;
}
.timers {
  gap: 14px;
}
.chip {
  padding: 1px 8px;
  border-radius: 999px;
  border: 2px solid #e2cc9c;
  background: #fff8e6;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}
.chip.win {
  color: #2f8a1c;
  border-color: #bfe3a5;
}
.chip.loss {
  color: #7a2015;
  border-color: #f2b9b1;
}
.chip.draw {
  color: #8a6a12;
  border-color: #ecd48f;
}
.score {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.kind {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--muted, #6f5940);
}
.body {
  margin: 4px 0 0;
  font-size: 13px;
}
.dib-empty {
  font-size: 13px;
  color: var(--muted, #6f5940);
  padding: 4px 2px;
}
.btn.tiny {
  padding: 2px 10px;
  font-size: 12px;
}
</style>
