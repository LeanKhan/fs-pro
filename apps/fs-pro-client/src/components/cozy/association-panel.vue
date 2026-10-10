<template>
  <section class="asc">
    <div v-if="loading && !assoc" class="asc-state">Loading the association…</div>

    <template v-else-if="!assocId">
      <header class="asc-head"><h2><span class="ic" v-html="icon('people')"></span> Association</h2></header>
      <div class="asc-card">
        <h3>Found one</h3>
        <p class="note">Start an association for up to 50 clubs, or open an existing one by id.</p>
        <label class="field"><span>Name</span><input v-model="form.name" maxlength="40" placeholder="Northern Alliance" /></label>
        <label class="field"><span>Tag</span><input v-model="form.tag" maxlength="6" placeholder="NALL" /></label>
        <label class="field"><span>Motto</span><input v-model="form.description" maxlength="120" placeholder="Stronger together" /></label>
        <button class="btn primary" :disabled="!canFound || busy === 'create'" @click="create">
          {{ busy === 'create' ? 'Founding…' : 'Found association' }}
        </button>
      </div>
      <div class="asc-card">
        <h3>Open an association</h3>
        <label class="field"><span>Association id</span><input v-model="joinId" placeholder="paste an id" /></label>
        <button class="btn" :disabled="!joinId || busy === 'lookup'" @click="openById">
          {{ busy === 'lookup' ? 'Looking…' : 'Open' }}
        </button>
        <button class="btn primary" :disabled="!joinId || busy === 'join'" @click="join">
          {{ busy === 'join' ? 'Joining…' : 'Join' }}
        </button>
      </div>
      <p v-if="error" class="asc-error" role="alert">{{ error }}</p>
    </template>

    <template v-else-if="assoc">
      <header class="asc-head">
        <h2><span class="ic" v-html="icon('people')"></span> {{ assoc.tag }} · {{ assoc.name }}</h2>
        <span class="chip">Level {{ assoc.level }}</span>
      </header>
      <p v-if="assoc.description" class="motto">“{{ assoc.description }}”</p>

      <div class="asc-card">
        <div class="card-head">
          <h3>Roster</h3>
          <span class="chip">{{ assoc.memberCount }} / {{ assoc.maxMembers }}</span>
        </div>
        <ul class="asc-list">
          <li v-for="m in assoc.members" :key="m.clubId" class="asc-row">
            <b>{{ m.name || m.clubId }}</b>
            <span class="role" :class="{ leader: m.isLeader }">{{ roleLabel(m.role) }}</span>
          </li>
        </ul>
        <div class="perks">
          <span class="perkchip">+{{ Math.round(assoc.perks.incomeBonusPct * 100) }}% income</span>
          <span class="perkchip">+{{ Math.round(assoc.perks.vaultBonusPct * 100) }}% reserve</span>
          <span class="note">{{ assoc.loanSlots }} loan slots</span>
        </div>
        <button v-if="isMember(assoc, clubId)" class="btn" :disabled="busy === 'leave'" @click="leave">
          {{ busy === 'leave' ? 'Leaving…' : 'Leave association' }}
        </button>
      </div>

      <!-- Grounds + Festival Weekend (02 §G). -->
      <div v-if="assoc.grounds" class="asc-card">
        <div class="card-head">
          <h3>Association Grounds</h3>
          <span class="chip" :class="{ live: assoc.grounds.festivalActive }">{{ festivalLabel(assoc.grounds) }}</span>
        </div>
        <div class="bar"><i :style="{ width: `${Math.round(assoc.grounds.fill * 100)}%` }"></i></div>
        <p class="note">
          Level {{ assoc.grounds.level }} / {{ assoc.grounds.maxLevel }} ·
          {{ currency(assoc.grounds.capitalGold) }} development funds<template v-if="!assoc.grounds.maxed"> · next {{ currency(assoc.grounds.nextCost) }}</template>
        </p>
        <p v-if="assoc.grounds.festivalActive && assoc.grounds.festivalClosesAt && serverNow" class="note">
          Festival closes <cozy-countdown :at="assoc.grounds.festivalClosesAt" :server-now="serverNow" />
        </p>
        <div class="inline">
          <input v-model.number="goldInput" type="number" min="1" class="gold" placeholder="amount" />
          <button class="btn primary" :disabled="!goldInput || busy === 'grounds'" @click="contribute">
            {{ busy === 'grounds' ? '…' : 'Contribute' }}
          </button>
        </div>
      </div>

      <!-- Directives board: weekly tiers with claims (02 §G, 04 §7). -->
      <div class="asc-card">
        <div class="card-head">
          <h3>Directives</h3>
          <span v-if="directives" class="chip">{{ directives.weekKey }}</span>
        </div>
        <ul class="asc-list">
          <li v-for="d in directives?.directives ?? []" :key="d.id" class="asc-row block">
            <div class="row-top">
              <b>{{ d.title }}</b>
              <span class="tier">{{ tierLabel(d.tier) }}</span>
            </div>
            <div class="bar small"><i :style="{ width: `${Math.round(d.fill * 100)}%` }"></i></div>
            <div class="row-meta">
              <span>{{ d.progress }} / {{ d.goal }}</span>
              <span v-if="d.rewards.cash">{{ currency(d.rewards.cash) }}</span>
              <span v-for="perk in directivePerks(d)" :key="perk" class="perkchip">{{ perk.replace(/_/g, ' ') }}</span>
              <button
                v-if="!canClaimed(d)"
                class="btn tiny primary"
                :disabled="!d.canClaim || busy === d.id"
                @click="claimDirective(d.tier, d.id)"
              >
                {{ busy === d.id ? '…' : 'Claim tier' }}
              </button>
              <span v-else class="done">Claimed</span>
            </div>
          </li>
          <li v-if="!directives?.directives.length" class="note">No directives this week.</li>
        </ul>
      </div>

      <!-- Derby: prep → battle → complete. -->
      <div class="asc-card">
        <div class="card-head">
          <h3>Derby</h3>
          <span v-if="derby" class="chip" :class="{ live: derby.phase === 'battle' }">{{ derbyPhaseLabel(derby.phase) }}</span>
        </div>
        <label class="field"><span>Derby id</span><input v-model="derbyId" placeholder="paste a derby id" /></label>
        <button class="btn" :disabled="!derbyId || busy === 'derby'" @click="advanceDerby">
          {{ busy === 'derby' ? '…' : 'Load / advance' }}
        </button>
        <template v-if="derby">
          <div class="scoreline">
            <b>{{ derby.homeStars }}★</b>
            <span>{{ derby.homeDestruction.toFixed(0) }}% — {{ derby.awayDestruction.toFixed(0) }}% pitch control</span>
            <b>{{ derby.awayStars }}★</b>
          </div>
          <p class="note">
            Result: {{ derby.result }}<template v-if="derby.practice"> · practice</template>
            <template v-if="derby.endsAt && serverNow"> · ends <cozy-countdown :at="derby.endsAt" :server-now="serverNow" /></template>
          </p>
        </template>
      </div>

      <!-- Loans. -->
      <div class="asc-card">
        <h3>Loans</h3>
        <label class="field"><span>Player id</span><input v-model="loan.playerId" placeholder="player id" /></label>
        <label class="field"><span>To club id</span><input v-model="loan.toClubId" placeholder="club id" /></label>
        <div class="inline">
          <input v-model.number="loan.hours" type="number" min="0" class="gold" placeholder="hours" />
          <button class="btn primary" :disabled="!loan.playerId || !loan.toClubId || busy === 'loan'" @click="moveLoan">
            {{ busy === 'loan' ? '…' : 'Loan player' }}
          </button>
        </div>
        <div class="inline">
          <input v-model="loan.loanId" class="gold wide" placeholder="loan id" />
          <button class="btn" :disabled="!loan.loanId || busy === 'return'" @click="returnLoan">
            {{ busy === 'return' ? '…' : 'Return' }}
          </button>
        </div>
      </div>

      <!-- Realtime: association chat + presence (cheap, 08 §4). -->
      <div class="asc-card">
        <div class="card-head">
          <h3>Association room</h3>
          <span class="chip">{{ here.length }} here</span>
        </div>
        <p v-if="here.length" class="note">Here now: {{ here.map((m) => m.name).join(', ') }}</p>
        <ol class="chat">
          <li v-for="m in lines" :key="m.id"><b>{{ m.from.name }}</b> <span>{{ m.text }}</span></li>
          <li v-if="!lines.length" class="note">Say hello to your association.</li>
        </ol>
        <form class="inline" @submit.prevent="say">
          <input v-model="draft" class="gold wide" maxlength="280" :disabled="!live" placeholder="message…" />
          <button class="btn primary" type="submit" :disabled="!draft.trim()">Send</button>
        </form>
      </div>
    </template>

    <p v-else-if="error" class="asc-error" role="alert">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import {
  coerceAssociation,
  coerceDerby,
  coerceDirectives,
  directivePerks,
  festivalLabel,
  isMember,
  roleLabel,
  derbyPhaseLabel,
  tierLabel,
  type AssociationView,
  type DerbyView,
  type DirectivesView,
} from '@/helpers/association-panel';
import { client } from '@/services/api';
import { isOk, payloadOrNull } from '@/helpers/envelope';
import { currency } from '@/helpers/misc';
import { realtime } from '@/services/realtime';
import { icon } from './icons';
import CozyCountdown from './cozy-countdown.vue';

/**
 * The Association surface (docs/coc-mapping/02 §G, 08 §2 P7, OW-N10).
 *
 * Found / join / open an association, see the roster, perks and loans, the
 * shared Association Grounds + Festival Weekend, the weekly Directives board
 * with tier claims, and the Derby lifecycle. The association id has no REST
 * listing, so it comes from the realtime ticket's `assocs` claim, a remembered
 * id, or the manager entering one. The `association:<id>` topic powers a cheap
 * chat/presence room. Plain HTML/CSS + cozy tokens.
 */
const props = defineProps<{ clubId: string; serverNow: string | null }>();
const emit = defineEmits<{ (e: 'toast', text: string, level?: 'success' | 'error'): void }>();

const STORAGE_KEY = 'fspro_association_id';

const assoc = ref<AssociationView | null>(null);
const directives = ref<DirectivesView | null>(null);
const derby = ref<DerbyView | null>(null);
const loading = ref(false);
const error = ref('');
const busy = ref('');
const assocId = ref(localStorage.getItem(STORAGE_KEY) ?? realtime.associationIds.value[0] ?? '');
const joinId = ref('');
const derbyId = ref('');
const goldInput = ref<number | null>(null);
const draft = ref('');
const form = reactive({ name: '', tag: '', description: '' });
const loan = reactive({ playerId: '', toClubId: '', hours: 0, loanId: '' });

const canFound = computed(
  () => form.name.trim().length > 0 && form.tag.trim().length > 0
);
const topic = computed(() => (assocId.value ? `association:${assocId.value}` : null));
const here = computed(() =>
  topic.value ? (realtime.presence.get(topic.value) ?? []) : []
);
const lines = computed(() =>
  (topic.value ? realtime.chats.get(topic.value) : undefined) ?? []
);
const live = computed(() => realtime.status.value === 'live');

function remember(id: string) {
  assocId.value = id;
  joinId.value = id;
  localStorage.setItem(STORAGE_KEY, id);
}

function canClaimed(d: DirectivesView['directives'][number]): boolean {
  return d.claimedTier >= d.tier;
}

async function load() {
  if (!assocId.value) return;
  loading.value = true;
  error.value = '';
  const res = await client.associations.get.query({ params: { id: assocId.value } });
  const next = coerceAssociation(payloadOrNull(res));
  if (next) {
    assoc.value = next;
    await loadDirectives();
  } else {
    error.value = 'Could not open that association.';
    localStorage.removeItem(STORAGE_KEY);
    assocId.value = '';
  }
  loading.value = false;
}

async function loadDirectives() {
  const res = await client.associations.directives.query({
    params: { id: assocId.value },
    query: { clubId: props.clubId },
  });
  directives.value = coerceDirectives(payloadOrNull(res));
}

async function create() {
  if (!canFound.value || busy.value) return;
  busy.value = 'create';
  const res = await client.associations.create.mutation({
    body: {
      clubId: props.clubId,
      name: form.name.trim(),
      tag: form.tag.trim(),
      description: form.description.trim(),
    },
  });
  const next = coerceAssociation(payloadOrNull(res));
  if (next) {
    remember(next.id);
    assoc.value = next;
    emit('toast', 'Association founded.');
    await loadDirectives();
  } else {
    emit('toast', 'Could not found the association.', 'error');
  }
  busy.value = '';
}

async function openById() {
  if (!joinId.value || busy.value) return;
  busy.value = 'lookup';
  const res = await client.associations.get.query({ params: { id: joinId.value } });
  const next = coerceAssociation(payloadOrNull(res));
  if (next) {
    remember(next.id);
    assoc.value = next;
    await loadDirectives();
  } else {
    emit('toast', 'No association with that id.', 'error');
  }
  busy.value = '';
}

async function join() {
  if (!joinId.value || busy.value) return;
  busy.value = 'join';
  const res = await client.associations.join.mutation({
    params: { id: joinId.value },
    body: { clubId: props.clubId },
  });
  const next = coerceAssociation(payloadOrNull(res));
  if (next) {
    remember(next.id);
    assoc.value = next;
    emit('toast', `Joined ${next.name}.`);
    await loadDirectives();
  } else {
    emit('toast', 'Could not join that association.', 'error');
  }
  busy.value = '';
}

async function leave() {
  if (!assocId.value || busy.value) return;
  busy.value = 'leave';
  const res = await client.associations.leave.mutation({
    params: { id: assocId.value },
    body: { clubId: props.clubId },
  });
  if (isOk(res)) {
    emit('toast', 'You left the association.');
    localStorage.removeItem(STORAGE_KEY);
    assoc.value = null;
    assocId.value = '';
    directives.value = null;
  } else {
    emit('toast', 'Could not leave the association.', 'error');
  }
  busy.value = '';
}

async function contribute() {
  if (!assocId.value || !goldInput.value || busy.value) return;
  busy.value = 'grounds';
  const res = await client.associations.grounds.mutation({
    params: { id: assocId.value },
    body: { clubId: props.clubId, gold: goldInput.value },
  });
  if (payloadOrNull(res)) {
    emit('toast', 'Grounds contribution accepted.');
    goldInput.value = null;
    await load();
  } else {
    emit('toast', 'Could not contribute (not enough Cash?).', 'error');
  }
  busy.value = '';
}

async function claimDirective(tier: number, id: string) {
  if (!assocId.value || busy.value) return;
  busy.value = id;
  const res = await client.associations.claimDirective.mutation({
    params: { id: assocId.value, directiveId: id },
    body: { clubId: props.clubId, tier },
  });
  if (payloadOrNull(res)) {
    emit('toast', 'Directive tier claimed.');
    await loadDirectives();
  } else {
    emit('toast', 'Could not claim that tier.', 'error');
  }
  busy.value = '';
}

async function advanceDerby() {
  if (!assocId.value || !derbyId.value || busy.value) return;
  busy.value = 'derby';
  const res = await client.associations.derby.mutation({
    params: { id: assocId.value, derbyId: derbyId.value },
    body: { clubId: props.clubId, action: 'advance' },
  });
  const next = coerceDerby(payloadOrNull(res));
  if (next) derby.value = next;
  else emit('toast', 'Could not load that derby.', 'error');
  busy.value = '';
}

async function moveLoan() {
  if (!assocId.value || !loan.playerId || !loan.toClubId || busy.value) return;
  busy.value = 'loan';
  const res = await client.associations.loan.mutation({
    params: { id: assocId.value },
    body: {
      clubId: props.clubId,
      playerId: loan.playerId,
      toClubId: loan.toClubId,
      hours: loan.hours,
    },
  });
  if (payloadOrNull(res)) emit('toast', 'Player loaned.');
  else emit('toast', 'Could not loan that player.', 'error');
  busy.value = '';
}

async function returnLoan() {
  if (!assocId.value || !loan.loanId || busy.value) return;
  busy.value = 'return';
  const res = await client.associations.loan.mutation({
    params: { id: assocId.value },
    body: { clubId: props.clubId, action: 'return', loanId: loan.loanId },
  });
  if (payloadOrNull(res)) emit('toast', 'Loan returned.');
  else emit('toast', 'Could not return that loan.', 'error');
  busy.value = '';
}

function say() {
  if (topic.value && draft.value.trim()) {
    realtime.say(topic.value, draft.value);
    draft.value = '';
  }
}

onMounted(() => {
  void load();
});
watch(
  topic,
  (next, prev) => {
    if (prev) realtime.leave(prev);
    if (next) realtime.join(next);
  },
  { immediate: true }
);
onUnmounted(() => {
  if (topic.value) realtime.leave(topic.value);
});
</script>

<style scoped>
.asc {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: var(--ink, #4a3220);
  font-family: 'Fredoka', system-ui, sans-serif;
}
.asc-state {
  padding: 20px;
  text-align: center;
}
.asc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.asc-head h2 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 19px;
}
.asc-head .ic {
  width: 24px;
  height: 24px;
}
.motto {
  margin: 0;
  font-style: italic;
  color: var(--muted, #6f5940);
}
.asc-card {
  padding: 12px;
  border-radius: 14px;
  background: #fffaf0;
  border: 3px solid #e2cc9c;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.asc-card h3 {
  margin: 0;
  font-size: 16px;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.chip {
  padding: 2px 9px;
  border-radius: 999px;
  background: #fff8e6;
  border: 2px solid #e2cc9c;
  font-size: 12px;
  font-weight: 700;
}
.chip.live {
  color: #2f8a1c;
  border-color: #bfe3a5;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 12px;
  color: var(--muted, #6f5940);
}
.field input,
.gold {
  font: inherit;
  font-size: 13px;
  padding: 5px 8px;
  border-radius: 9px;
  border: 2px solid #e2cc9c;
  background: #fffdf7;
}
.gold {
  width: 90px;
}
.gold.wide {
  flex: 1;
  width: auto;
  min-width: 0;
}
.inline {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.asc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.asc-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 10px;
  background: #fffdf7;
  border: 2px solid #eadbb8;
}
.asc-row.block {
  flex-direction: column;
  align-items: stretch;
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
.role {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--muted, #6f5940);
  font-weight: 700;
}
.role.leader {
  color: #b8860b;
}
.tier {
  font-size: 12px;
  font-weight: 800;
  color: var(--muted, #6f5940);
}
.perks {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.perkchip {
  padding: 1px 7px;
  border-radius: 999px;
  background: #fff4d2;
  border: 2px solid var(--gold, #f5b82e);
  color: #8a6a12;
  font-weight: 700;
  font-size: 11px;
  text-transform: capitalize;
}
.bar {
  height: 10px;
  border-radius: 999px;
  background: rgba(138, 90, 59, 0.15);
  overflow: hidden;
}
.bar.small {
  height: 7px;
}
.bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--gold, #f5b82e), var(--green, #5cc23a));
}
.done {
  color: var(--green-d, #2f8a1c);
  font-weight: 700;
}
.scoreline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 16px;
}
.chat {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 160px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}
.chat b {
  font-size: 12px;
  color: var(--wood-d, #6b3f22);
}
.note {
  margin: 0;
  font-size: 12.5px;
  color: var(--muted, #6f5940);
}
.asc-error {
  color: var(--red, #e5402f);
  font-weight: 700;
  font-size: 13px;
}
.btn.tiny {
  padding: 2px 10px;
  font-size: 12px;
}
</style>
