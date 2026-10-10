<template>
  <section class="abt">
    <div v-if="loading && !data" class="abt-state">Loading the training ground…</div>
    <div v-else-if="error && !data" class="abt-state bad" role="alert">
      <p>{{ error }}</p>
      <button class="btn small" @click="load">Try again</button>
    </div>

    <template v-else-if="data">
      <header class="abt-head">
        <h2><span class="ic" v-html="icon('bag')"></span> Abilities &amp; Tactical Orders</h2>
        <span class="chip">Coaching tier {{ data.facilityTier }}</span>
      </header>

      <nav class="abt-tabs">
        <button :class="{ on: tab === 'abilities' }" @click="tab = 'abilities'">Abilities</button>
        <button :class="{ on: tab === 'traits' }" @click="tab = 'traits'">Traits</button>
        <button :class="{ on: tab === 'orders' }" @click="tab = 'orders'">Tactical Orders</button>
      </nav>

      <!-- Abilities: per-player syllabus + slotting (03 Part 2). -->
      <template v-if="tab === 'abilities'">
        <div class="abt-card">
          <div class="card-head">
            <h3>Player</h3>
            <span v-if="player" class="chip">{{ player.family }} · {{ masteryLabel(player.masteryTier) }}</span>
          </div>
          <div class="player-pick">
            <button
              v-for="p in data.players"
              :key="p.playerId"
              class="pick"
              :class="{ on: p.playerId === selectedId }"
              @click="selectedId = p.playerId"
            >
              <b>{{ p.name }}</b>
              <small>{{ p.position || p.role }}</small>
            </button>
            <p v-if="!data.players.length" class="note">No signed players.</p>
          </div>
        </div>

        <template v-if="player">
          <div class="abt-card">
            <div class="card-head">
              <h3>Slotted</h3>
              <span class="chip">{{ slotLabel(player) }} slots</span>
            </div>
            <ul class="abt-list">
              <li v-for="s in player.slotted" :key="s.abilityId" class="abt-row">
                <div class="row-top"><b>{{ s.name }}</b><span class="note">{{ masteryLabel(s.masteryTier) }} · {{ s.xp }} xp</span></div>
              </li>
              <li v-if="!player.slotted.length" class="abt-empty">Nothing slotted.</li>
            </ul>
          </div>

          <div class="abt-card">
            <h3>Syllabus</h3>
            <ul class="abt-list">
              <li
                v-for="a in player.syllabus"
                :key="a.abilityId"
                class="abt-row"
                :class="{ off: !a.eligible, slotted: isSlotted(a.abilityId) }"
              >
                <div class="row-top">
                  <b>{{ a.name }}</b>
                  <span class="note">{{ a.family }} · needs mastery {{ a.masteryTier }}</span>
                </div>
                <div class="row-meta">
                  <span class="trigger">{{ a.trigger }}</span>
                  <span v-if="isSlotted(a.abilityId)" class="done">Slotted</span>
                  <button
                    v-else
                    class="btn tiny primary"
                    :disabled="!a.eligible || !hasFreeSlot(player) || busy === a.abilityId"
                    @click="slot(a.abilityId)"
                  >
                    {{ busy === a.abilityId ? '…' : 'Slot' }}
                  </button>
                </div>
                <p v-if="!a.eligible && a.reason" class="why">{{ a.reason }}</p>
              </li>
            </ul>
          </div>
        </template>
      </template>

      <!-- Traits: the catalogue + 2 slots. -->
      <template v-else-if="tab === 'traits'">
        <div class="abt-card">
          <div class="card-head">
            <h3>Traits</h3>
            <span class="chip">{{ catalogue.maxSlots }} slots per player</span>
          </div>
          <p class="note">Pick a player, a slot, then a trait.</p>
          <div class="player-pick">
            <button
              v-for="p in data.players"
              :key="p.playerId"
              class="pick"
              :class="{ on: p.playerId === selectedId }"
              @click="selectedId = p.playerId"
            >
              <b>{{ p.name }}</b>
              <small>{{ p.position || p.role }}</small>
            </button>
          </div>
        </div>
        <div class="abt-card">
          <div class="card-head">
            <h3>Catalogue</h3>
            <div class="slots">
              <button
                v-for="n in catalogue.maxSlots"
                :key="n"
                class="slot"
                :class="{ on: traitSlot === n - 1 }"
                @click="traitSlot = n - 1"
              >
                Slot {{ n }}
              </button>
            </div>
          </div>
          <ul class="abt-list">
            <li v-for="t in catalogue.traits" :key="t.id" class="abt-row">
              <div class="row-top">
                <b>{{ t.name }}</b>
                <span class="rarity" :class="t.rarity">{{ traitRarityLabel(t.rarity) }}</span>
              </div>
              <p class="note">{{ t.description }}</p>
              <div class="row-meta">
                <span class="trigger">{{ t.effect }}</span>
                <button
                  class="btn tiny primary"
                  :disabled="!selectedId || busy === t.id"
                  @click="equip(t.id)"
                >
                  {{ busy === t.id ? '…' : `Equip slot ${traitSlot + 1}` }}
                </button>
              </div>
            </li>
          </ul>
          <div v-if="equipped" class="equipped">
            <b>Equipped:</b>
            <span v-for="(e, i) in equipped" :key="i" class="perkchip">{{ e.traitId }} ({{ traitRarityLabel(e.rarity) }})</span>
            <span v-if="!equipped.length" class="note">none</span>
          </div>
        </div>
      </template>

      <!-- Tactical Orders: order prep (02 §D). -->
      <template v-else>
        <div v-if="orders" class="abt-card">
          <div class="card-head">
            <h3>Orders</h3>
            <span class="chip">{{ count(orders.fans) }} Fans</span>
          </div>
          <ul class="abt-list">
            <li v-for="o in orders.orders" :key="o.id" class="abt-row">
              <div class="row-top">
                <b>{{ o.name }}</b>
                <span class="stock">{{ o.count }} / {{ o.max }}</span>
              </div>
              <p class="note">{{ o.description }}</p>
              <div class="row-meta">
                <span class="trigger">{{ o.cost }} Fans each</span>
                <span v-if="o.region" class="note">zone {{ o.region.x0 }}–{{ o.region.x1 }}</span>
                <button
                  class="btn tiny primary"
                  :disabled="o.count >= o.max || busy === o.id"
                  @click="prepare(o.id, o.count + 1)"
                >
                  {{ busy === o.id ? '…' : '+1' }}
                </button>
                <button class="btn tiny" :disabled="busy === o.id" @click="prepare(o.id, o.max)">
                  Fill
                </button>
              </div>
            </li>
          </ul>
        </div>
      </template>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { client } from '@/services/api';
import { payloadOrNull } from '@/helpers/envelope';
import {
  coerceAbilities,
  coerceLoadout,
  coerceOrders,
  coerceTraits,
  hasFreeSlot,
  masteryLabel,
  slotLabel,
  traitRarityLabel,
  type AbilitiesView,
  type OrderInventoryView,
  type PlayerAbilitiesView,
  type TraitCatalogueView,
} from '@/helpers/abilities-room';
import { icon } from './icons';

/**
 * The Gated-abilities / Traits / War-Room surface (docs/coc-mapping/03 Part 2,
 * 08 §2 P4, OW-N11).
 *
 * `abilities.list` gives every player's family syllabus with mastery and the
 * exact facility/mastery gate **reason strings**; slotting calls
 * `abilities.slot`. The trait catalogue (`traits.list`) equips into two slots
 * via `traits.equip`. The War Room reads `orders.inventory` and stocks orders
 * with `orders.prepare` (spending Fans). Plain HTML/CSS + cozy tokens.
 */
const props = defineProps<{ clubId: string }>();
const emit = defineEmits<{ (e: 'toast', text: string, level?: 'success' | 'error'): void }>();

const data = ref<AbilitiesView | null>(null);
const catalogue = ref<TraitCatalogueView>({ traits: [], rarities: [], maxSlots: 2 });
const orders = ref<OrderInventoryView | null>(null);
const loading = ref(false);
const error = ref('');
const tab = ref<'abilities' | 'traits' | 'orders'>('abilities');
const selectedId = ref('');
const traitSlot = ref(0);
const busy = ref('');
/** Player loadouts returned from slot/equip (no GET loadout route exists). */
const loadouts = ref<Record<string, { traitId: string; slot: number; rarity: string }[]>>({});

const player = computed<PlayerAbilitiesView | null>(
  () => data.value?.players.find((p) => p.playerId === selectedId.value) ?? null
);
const equipped = computed(() => loadouts.value[selectedId.value] ?? null);
const count = (n: number) => Math.floor(n).toLocaleString('en-US');

function isSlotted(abilityId: string): boolean {
  return player.value?.slotted.some((s) => s.abilityId === abilityId) ?? false;
}

async function load() {
  if (!props.clubId) return;
  loading.value = true;
  error.value = '';
  const [a, t, o] = await Promise.all([
    client.abilities.list.query({ params: { id: props.clubId } }),
    client.traits.list.query(),
    client.orders.inventory.query({ params: { id: props.clubId } }),
  ]);
  const next = coerceAbilities(payloadOrNull(a));
  if (next) {
    data.value = next;
    if (!next.players.some((p) => p.playerId === selectedId.value))
      selectedId.value = next.players[0]?.playerId ?? '';
  }
  const cat = coerceTraits(payloadOrNull(t));
  if (cat) catalogue.value = cat;
  const inv = coerceOrders(payloadOrNull(o));
  if (inv) orders.value = inv;
  if (!next) error.value = 'Could not load the ability syllabus.';
  loading.value = false;
}

async function slot(abilityId: string) {
  const p = player.value;
  if (!p || busy.value) return;
  busy.value = abilityId;
  const res = await client.abilities.slot.mutation({
    params: { id: props.clubId, pid: p.playerId },
    body: { abilityId },
  });
  const loadout = coerceLoadout(payloadOrNull(res));
  if (loadout) {
    emit('toast', `${abilityId.replace(/_/g, ' ')} slotted.`);
    await load();
  } else {
    emit('toast', 'Could not slot that ability.', 'error');
  }
  busy.value = '';
}

async function equip(traitId: string) {
  const p = player.value;
  if (!p || busy.value) return;
  busy.value = traitId;
  const res = await client.traits.equip.mutation({
    params: { id: props.clubId, pid: p.playerId },
    body: { traitId, slot: traitSlot.value },
  });
  const loadout = coerceLoadout(payloadOrNull(res));
  if (loadout) {
    loadouts.value = { ...loadouts.value, [p.playerId]: loadout.traits };
    emit('toast', `${traitId.replace(/_/g, ' ')} equipped.`);
  } else {
    emit('toast', 'Could not equip that trait.', 'error');
  }
  busy.value = '';
}

async function prepare(orderId: string, target: number) {
  if (busy.value) return;
  busy.value = orderId;
  const res = await client.orders.prepare.mutation({
    params: { id: props.clubId },
    body: { orderId, count: target },
  });
  const inv = coerceOrders(payloadOrNull(res));
  if (inv) {
    orders.value = inv;
    emit('toast', `${orderId.replace(/_/g, ' ')} stocked.`);
  } else {
    emit('toast', 'Could not prepare that order (not enough Fans?).', 'error');
  }
  busy.value = '';
}

onMounted(load);
</script>

<style scoped>
.abt {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: var(--ink, #4a3220);
  font-family: 'Fredoka', system-ui, sans-serif;
}
.abt-state {
  padding: 20px;
  text-align: center;
}
.abt-state.bad {
  color: var(--red, #e5402f);
}
.abt-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.abt-head h2 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 20px;
}
.abt-head .ic {
  width: 24px;
  height: 24px;
}
.abt-tabs {
  display: flex;
  gap: 6px;
}
.abt-tabs button {
  padding: 5px 12px;
  border-radius: 999px;
  border: 2px solid #e2cc9c;
  background: #fff8e6;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.abt-tabs button.on {
  background: linear-gradient(#fff8e6, #f1dfb6);
  border-color: var(--gold, #f5b82e);
}
.abt-card {
  padding: 12px;
  border-radius: 14px;
  background: #fffaf0;
  border: 3px solid #e2cc9c;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.abt-card h3 {
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
.player-pick {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.pick {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 5px 10px;
  border-radius: 10px;
  border: 2px solid #e2cc9c;
  background: #fffdf7;
  font: inherit;
  cursor: pointer;
}
.pick.on {
  border-color: var(--green, #5cc23a);
  background: #f6fdf1;
}
.pick b {
  font-size: 13px;
}
.pick small {
  font-size: 11px;
  color: var(--muted, #6f5940);
}
.abt-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.abt-row {
  padding: 8px 10px;
  border-radius: 11px;
  background: #fffdf7;
  border: 2px solid #eadbb8;
}
.abt-row.off {
  opacity: 0.62;
}
.abt-row.slotted {
  border-color: #bfe3a5;
  background: #f6fdf1;
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
.trigger {
  font-style: italic;
}
.stock {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.done {
  color: var(--green-d, #2f8a1c);
  font-weight: 700;
}
.why {
  margin: 6px 0 0;
  font-size: 12px;
  color: #7a2015;
}
.rarity {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--muted, #6f5940);
}
.rarity.glowy {
  color: #2f7dd0;
}
.rarity.starry {
  color: #b8860b;
}
.slots {
  display: flex;
  gap: 6px;
}
.slot {
  padding: 3px 10px;
  border-radius: 999px;
  border: 2px solid #e2cc9c;
  background: #fff8e6;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.slot.on {
  border-color: var(--green, #5cc23a);
  background: #f6fdf1;
}
.equipped {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  padding-top: 4px;
  border-top: 1px dashed #eadbb8;
}
.perkchip {
  padding: 1px 7px;
  border-radius: 999px;
  background: #fff4d2;
  border: 2px solid var(--gold, #f5b82e);
  color: #8a6a12;
  font-weight: 700;
}
.abt-empty,
.note {
  margin: 0;
  font-size: 12.5px;
  color: var(--muted, #6f5940);
}
.btn.tiny {
  padding: 2px 10px;
  font-size: 12px;
}
</style>
