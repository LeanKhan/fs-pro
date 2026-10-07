<template>
  <div class="presence">
    <button class="pres-pill" :class="{ live: status === 'live' }" :aria-expanded="open" @click="open = !open">
      <i class="led" aria-hidden="true"></i>
      <span v-if="status === 'live'">{{ online }} online</span>
      <span v-else>{{ status === 'connecting' ? 'Connecting…' : 'Offline' }}</span>
      <template v-if="visitors.length">
        <span class="sep">·</span>
        <span class="here" :title="visitors.map((v) => v.name).join(', ')">{{ visitors.length }} at the ground</span>
      </template>
      <i v-if="unread" class="dot count">{{ unread }}</i>
    </button>

    <section v-if="open" class="chat" aria-label="Chat">
      <header class="chat-head">
        <div class="drawer-tabs">
          <button v-if="groundTopic" :class="{ on: tab === 'ground' }" @click="tab = 'ground'">Ground</button>
          <button :class="{ on: tab === 'world' }" @click="tab = 'world'">World</button>
        </div>
        <button class="x" aria-label="Close chat" @click="open = false" v-html="icon('close')"></button>
      </header>
      <p v-if="tab === 'ground'" class="chat-who">
        <template v-if="here.length">Here now: {{ here.map((m) => m.name + (m.code ? ` (${m.code})` : '')).join(', ') }}</template>
        <template v-else>Nobody else is here right now.</template>
      </p>
      <ol ref="list" class="chat-lines">
        <li v-for="m in lines" :key="m.id" :class="{ mine: m.from.uid === me?.uid }">
          <b>{{ m.from.name }}<small v-if="m.from.code"> {{ m.from.code }}</small></b>
          <span>{{ m.text }}</span>
          <time>{{ clock(m.at) }}</time>
          <span v-if="m.from.uid !== me?.uid" class="chat-actions">
            <button type="button" :aria-label="`Report ${m.from.name}'s message`" @click="report(m)">Report</button>
            <button type="button" :aria-label="`Block ${m.from.name}`" @click="block(m)">Block</button>
          </span>
        </li>
        <li v-if="!lines.length" class="empty">{{ tab === 'ground' ? `Say hello to ${clubName}'s visitors` : 'Say hello to the world' }}</li>
      </ol>
      <form class="chat-send" @submit.prevent="send">
        <input v-model="draft" maxlength="280" :placeholder="status === 'live' ? 'Write a message…' : 'Chat is offline'" :disabled="status !== 'live'" />
        <button class="btn small primary" type="submit" :disabled="!draft.trim() || status !== 'live'">Send</button>
      </form>
      <p v-if="blockedHere" class="chat-note">
        {{ blockedHere }} blocked {{ blockedHere === 1 ? 'player' : 'players' }} hidden.
        <button type="button" @click="unblockAll">Show them</button>
      </p>
      <p v-if="notice" class="chat-note" role="status">{{ notice }}</p>
      <p v-if="error" class="chat-error" role="alert">{{ error }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { realtime, type Member } from '@/services/realtime';
import { icon } from './icons';

/** With a club: its ground's presence and chat plus the world chat. Without
 * one (the world map): the world chat only. */
const props = withDefaults(defineProps<{ clubId?: string | null; clubName?: string; isMine?: boolean }>(), {
  clubId: null,
  clubName: '',
  isMine: false,
});
const emit = defineEmits<{ (e: 'notify', text: string): void }>();

const open = ref(false);
const tab = ref<'ground' | 'world'>(props.clubId ? 'ground' : 'world');
const draft = ref('');
const list = ref<HTMLOListElement | null>(null);
const seen = ref(0);

const status = realtime.status;
const online = realtime.online;
const me = realtime.me;
const error = realtime.lastError;

const groundTopic = computed(() => (props.clubId ? `campus:${props.clubId}` : null));
const topic = computed(() => (tab.value === 'ground' && groundTopic.value ? groundTopic.value : 'world'));
const here = computed<Member[]>(() =>
  groundTopic.value ? (realtime.presence.get(groundTopic.value) ?? []).filter((m) => m.uid !== me.value?.uid) : []
);
const visitors = here;
const notice = realtime.lastNotice;
const lines = computed(() => (realtime.chats.get(topic.value) ?? []).filter((m) => !realtime.blocked.has(m.from.uid)));
const blockedHere = computed(() => new Set((realtime.chats.get(topic.value) ?? []).filter((m) => realtime.blocked.has(m.from.uid)).map((m) => m.from.uid)).size);
const groundLines = computed(() => realtime.chats.get(groundTopic.value ?? 'world') ?? []);
const unread = computed(() => (open.value ? 0 : Math.max(0, groundLines.value.length - seen.value)));

watch(
  groundTopic,
  (next, prev) => {
    if (prev) realtime.leave(prev);
    if (next) realtime.join(next);
    seen.value = 0;
  },
  { immediate: true }
);
realtime.join('world');
onBeforeUnmount(() => {
  if (groundTopic.value) realtime.leave(groundTopic.value);
  realtime.leave('world');
});

// Mark the ground chat read while it's open, and keep the newest line in view.
watch([open, () => lines.value.length], async () => {
  if (open.value) seen.value = groundLines.value.length;
  await nextTick();
  list.value?.scrollTo({ top: list.value.scrollHeight });
});
// History arrives on joining; it isn't news.
watch(
  () => realtime.chats.has(groundTopic.value ?? 'world'),
  (has) => has && !seen.value && (seen.value = groundLines.value.length)
);

// The owner hears when someone walks into their ground.
let known = new Set<string>();
watch(here, (members) => {
  const ids = new Set(members.map((m) => m.uid));
  if (props.isMine) {
    for (const m of members) if (!known.has(m.uid)) emit('notify', `${m.name} is visiting your ground`);
  }
  known = ids;
});

function send() {
  realtime.lastError.value = '';
  realtime.lastNotice.value = '';
  realtime.say(topic.value, draft.value);
  draft.value = '';
}

function report(m: { id: number }) {
  realtime.lastError.value = '';
  realtime.report(topic.value, m.id);
}

function block(m: { from: Member }) {
  realtime.block(m.from.uid);
  realtime.lastNotice.value = `${m.from.name} is blocked on this device.`;
}

function unblockAll() {
  for (const uid of [...realtime.blocked]) realtime.unblock(uid);
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
</script>

<style scoped>
.presence {
  position: absolute;
  left: 12px;
  bottom: 120px;
  z-index: 6;
  display: flex;
  flex-direction: column-reverse;
  align-items: flex-start;
  gap: 8px;
}
.pres-pill {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px 5px 10px;
  border-radius: 14px;
  background: var(--cream);
  border: 3px solid #c9a46a;
  box-shadow: var(--shadow);
  font-weight: 600;
  font-size: 14px;
}
.led {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #b9a37f;
}
.live .led {
  background: var(--green);
  box-shadow: 0 0 0 3px rgba(92, 194, 58, 0.25);
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse {
  50% {
    box-shadow: 0 0 0 6px rgba(92, 194, 58, 0);
  }
}
.sep {
  color: var(--muted);
}
.here {
  color: var(--blue);
}
.pres-pill .dot.count {
  display: grid;
}
.chat {
  width: min(340px, calc(100vw - 24px));
  display: flex;
  flex-direction: column;
  border-radius: 18px;
  background: var(--cream);
  border: 3px solid #c9a46a;
  box-shadow: var(--shadow);
  overflow: hidden;
  animation: pop 0.18s ease-out;
  user-select: text;
}
.chat-head {
  position: relative;
  display: flex;
  align-items: center;
  padding: 8px 40px 8px 10px;
  background: linear-gradient(#fff8e6, #f1dfb6);
  border-bottom: 2px solid #e2cc9c;
}
.chat-head .x {
  top: 6px;
}
.chat-who {
  margin: 0;
  padding: 6px 12px;
  font-size: 12px;
  color: var(--muted);
  border-bottom: 1px dashed #eadbb8;
}
.chat-lines {
  list-style: none;
  margin: 0;
  padding: 8px 10px;
  height: 220px;
  overflow: auto;
  display: grid;
  align-content: start;
  gap: 6px;
}
.chat-lines li {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0 6px;
  padding: 6px 8px;
  border-radius: 10px;
  background: #fffaf0;
  border: 2px solid #eadbb8;
  font-size: 14px;
}
.chat-lines li.mine {
  background: #eaf8e0;
  border-color: #bfe3a5;
}
.chat-lines b {
  font-size: 12px;
  color: var(--wood-d);
}
.chat-lines small {
  color: var(--muted);
}
.chat-lines span {
  grid-column: 1 / -1;
  overflow-wrap: anywhere;
}
.chat-lines time {
  grid-row: 1;
  grid-column: 2;
  font-size: 11px;
  color: var(--muted);
}
.chat-actions {
  display: flex;
  gap: 10px;
  margin-top: 2px;
  opacity: 0.55;
}
.chat-lines li:hover .chat-actions,
.chat-lines li:focus-within .chat-actions {
  opacity: 1;
}
@media (hover: none) {
  .chat-actions {
    opacity: 0.8;
  }
}
.chat-actions button {
  padding: 2px 0;
  font-size: 11px;
  color: var(--muted);
  text-decoration: underline;
  cursor: pointer;
  background: none;
  border: 0;
}
.chat-actions button:hover {
  color: var(--wood-d);
}
.chat-note {
  margin: 4px 10px 0;
  font-size: 12px;
  color: var(--muted);
}
.chat-note button {
  margin-left: 4px;
  font-size: 12px;
  text-decoration: underline;
  background: none;
  border: 0;
  cursor: pointer;
  color: var(--wood-d);
}
.chat-lines .empty {
  display: block;
  text-align: center;
  color: var(--muted);
  background: none;
  border: 0;
}
.chat-send {
  display: flex;
  gap: 6px;
  padding: 8px;
  border-top: 2px solid #e2cc9c;
}
.chat-send input {
  flex: 1;
  min-width: 0;
  font: inherit;
  padding: 6px 10px;
  border-radius: 10px;
  border: 2px solid #e2cc9c;
  background: #fffaf0;
  outline: none;
  user-select: text;
}
.chat-send input:focus {
  border-color: var(--green);
}
.chat-error {
  margin: 0;
  padding: 0 10px 8px;
  font-size: 12px;
  color: var(--red);
}
@media (max-width: 760px) {
  /* Under the goal card, clear of the date chips at the bottom. */
  .presence {
    left: 8px;
    top: 252px;
    bottom: auto;
    flex-direction: column;
  }
  .pres-pill {
    font-size: 12px;
    padding: 4px 10px 4px 8px;
  }
}
</style>
