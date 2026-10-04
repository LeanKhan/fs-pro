<template>
  <div class="cozy found">
    <atlas-map
      v-if="atlas"
      ref="mapRef"
      :atlas="atlas"
      :selected="mapSelection"
      :placing="placing"
      :placing-country-id="countryId"
      :pending="pendingSpot"
      :focus-country-id="step === 'country' ? null : countryId"
      :my-club-ids="myClubIds"
      :insets="insets"
      @select="onMapSelect"
      @place="onPlace"
    />
    <div v-else class="found-loading">{{ loadError || 'Unrolling the map…' }}</div>

    <header class="found-head">
      <div class="found-title">
        <span v-html="icon('star')"></span>
        <div>
          <b>{{ done ? 'Welcome to the world' : 'Found your club' }}</b>
          <small v-if="!done">{{ STEP_HINT[step] }}</small>
        </div>
      </div>
      <ol v-if="!done" class="found-steps" aria-label="Steps">
        <li v-for="(s, i) in STEPS" :key="s" :class="{ on: s === step, past: i < stepIndex }">
          <button type="button" :disabled="i > maxReachable" @click="goTo(s)">{{ i + 1 }}. {{ STEP_LABEL[s] }}</button>
        </li>
      </ol>
      <button v-if="hasClub && !done" class="btn small" type="button" @click="router.push(`/game/${firstClubId}`)">Back to my club</button>
    </header>

    <aside class="found-panel" :class="{ wide: step === 'club' && !placing }">
      <!-- 1. Country -->
      <template v-if="step === 'country'">
        <template v-if="placing === 'country' || pendingSpot">
          <h2><span v-html="icon('map')"></span>Found a country</h2>
          <p v-if="!pendingSpot" class="sub">Tap open sea on the map to place your country. It needs room around it to grow.</p>
          <found-country-form v-else :spot="pendingSpot" @founded="onCountryFounded" @cancel="cancelPlacing" />
          <div v-if="!pendingSpot" class="row-btns sticky"><button class="btn" type="button" @click="cancelPlacing">Cancel</button></div>
        </template>
        <template v-else>
          <h2><span v-html="icon('map')"></span>Where in the world?</h2>
          <p class="sub">Every club belongs to a town, and every town to a country. Pick a country, or found your own.</p>
          <ul class="list">
            <li v-for="c in countryList" :key="c.id">
              <button type="button" class="item" :class="{ on: c.id === countryId }" @click="selectCountry(c.id)">
                <span class="flag small" aria-hidden="true"><i :style="{ background: c.colors[0] }"></i><i :style="{ background: c.colors[1] }"></i></span>
                <span class="grow"><b>{{ c.name }}</b><small>{{ c.towns }} towns · {{ c.clubs }} clubs{{ c.founder ? ` · founded by ${c.founder.name}` : '' }}</small></span>
              </button>
            </li>
          </ul>
          <div class="row-btns sticky">
            <button v-if="canFound('countries')" class="btn" type="button" @click="startPlacing('country')" v-html="`${icon('up')} Found a new country`"></button>
            <button class="btn primary" type="button" :disabled="!countryId" @click="goTo('town')">Next: pick a town</button>
          </div>
          <p v-if="!canFound('countries')" class="note">You have founded your country already.</p>
        </template>
      </template>

      <!-- 2. Town -->
      <template v-else-if="step === 'town'">
        <template v-if="placing === 'town' || pendingSpot">
          <h2><span v-html="icon('map')"></span>Found a town in {{ country?.name }}</h2>
          <p v-if="!pendingSpot" class="sub">Tap the map inside {{ country?.name }} (or on the coast) to place your town.</p>
          <found-town-form v-else-if="countryId" :country-id="countryId" :spot="pendingSpot" @founded="onTownFounded" @cancel="cancelPlacing" />
          <div v-if="!pendingSpot" class="row-btns sticky"><button class="btn" type="button" @click="cancelPlacing">Cancel</button></div>
        </template>
        <template v-else>
          <h2><span v-html="icon('map')"></span>Pick your home town</h2>
          <p class="sub">{{ country?.name }} has {{ townList.length }} town{{ townList.length === 1 ? '' : 's' }}. A town holds {{ TOWN_MAX_CLUBS }} clubs; new clubs bring local rivals with them.</p>
          <ul class="list">
            <li v-for="t in townList" :key="t.id">
              <button type="button" class="item" :class="{ on: t.id === townId, off: t.full }" :disabled="t.full" @click="selectTown(t.id)">
                <span class="tdot" :class="t.terrain" aria-hidden="true"></span>
                <span class="grow"><b>{{ t.name }}</b><small>{{ TERRAIN_LABEL[t.terrain] }} · {{ t.clubs.length }}/{{ TOWN_MAX_CLUBS }} clubs{{ t.full ? ' · full' : '' }}</small></span>
                <span class="crests"><img v-for="c in t.clubs.slice(0, 4)" :key="c.id" :src="crestUrl(c.code)" :alt="c.name" :title="c.name" /></span>
              </button>
            </li>
            <li v-if="!townList.length" class="empty">No towns yet. Found the first one!</li>
          </ul>
          <div class="row-btns sticky">
            <button class="btn" type="button" @click="goTo('country')">Back</button>
            <button v-if="canFound('towns')" class="btn" type="button" @click="startPlacing('town')" v-html="`${icon('up')} Found a town`"></button>
            <button class="btn primary" type="button" :disabled="!townId" @click="goTo('club')">Next: your club</button>
          </div>
        </template>
      </template>

      <!-- 3. Club -->
      <template v-else-if="step === 'club'">
        <h2><span v-html="icon('people')"></span>Your club</h2>
        <form class="form club-form" @submit.prevent="goTo('review')">
          <div class="two">
            <label>Club name<input v-model="clubForm.name" maxlength="40" :placeholder="`${town?.name ?? 'Town'} United`" @input="onClubName" /></label>
            <label>Code<input v-model="clubForm.code" maxlength="4" class="code" @input="onClubCode" /></label>
          </div>
          <label><span>Ground <small>(stadium name)</small></span><input v-model="clubForm.stadium" maxlength="40" :placeholder="`${town?.name ?? 'Town'} Park`" /></label>
          <p v-if="nameCheck.problem" class="warn">{{ nameCheck.problem }}</p>
          <p v-else-if="nameCheck.ok && clubForm.name.trim()" class="warn good">{{ clubForm.name.trim() }} is free</p>
          <crest-designer v-model="crest" />
          <div class="row-btns sticky">
            <button class="btn" type="button" @click="goTo('town')">Back</button>
            <button class="btn primary" type="submit" :disabled="!clubReady">Next: kick-off</button>
          </div>
        </form>
      </template>

      <!-- 4. Review / done -->
      <template v-else-if="step === 'review'">
        <template v-if="!done">
          <h2><span v-html="icon('ball')"></span>Kick-off</h2>
          <div class="review">
            <img :src="crestDataUrl(crest, 'review')" alt="" width="110" height="123" />
            <div>
              <h3>{{ clubForm.name.trim() }} <span class="lv">{{ clubForm.code }}</span></h3>
              <p class="sub">{{ town?.name }}, {{ country?.name }} · {{ clubForm.stadium.trim() || `${town?.name} Park` }}</p>
            </div>
          </div>
          <div class="stats-row">
            <div><small>Bank</small><b>1.5M</b></div>
            <div><small>Squad</small><b>16</b></div>
            <div><small>Level</small><b>0</b></div>
            <div><small>Fans</small><b>150</b></div>
          </div>
          <p class="sub">You start from nothing: a dirt pitch, hopeful amateurs, a few loyal fans. Win matches to earn money and XP, then build your grounds up.</p>
          <p v-if="formError" class="warn">{{ formError }}</p>
          <div class="row-btns sticky">
            <button class="btn" type="button" @click="goTo('club')">Back</button>
            <button class="btn primary big" type="button" :disabled="busy" @click="submitClub">{{ busy ? 'Founding…' : `Found ${clubForm.name.trim()}` }}</button>
          </div>
        </template>
        <template v-else>
          <div class="done">
            <img :src="crestDataUrl(crest, 'done')" alt="" width="130" height="146" class="pop" />
            <h2>{{ clubForm.name.trim() }} is born!</h2>
            <p class="sub">{{ town?.name }} has a new club. The board, sixteen amateurs and {{ 150 }} fans are waiting at the ground.</p>
            <div v-if="done.rivals.length" class="warn good">Local rivals formed too: {{ done.rivals.map((r) => r.name).join(' and ') }}</div>
            <div class="row-btns sticky"><button class="btn primary big" type="button" @click="router.push(`/game/${done.clubId}?welcome=1`)">Go to your ground</button></div>
          </div>
        </template>
      </template>
    </aside>

    <div class="toasts"><div v-if="toast" class="toast" :class="toast.tone">{{ toast.text }}</div></div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  FOUNDING_LIMITS,
  TOWN_MAX_CLUBS,
  crestDataUrl,
  randomCrest,
  suggestCode,
  type Atlas,
  type CrestDesign,
  type FoundedClub,
} from '@repo/api-contract';
import AtlasMap, { type AtlasPick } from '@/components/atlas/atlas-map.vue';
import CrestDesigner from '@/components/atlas/crest-designer.vue';
import FoundCountryForm from '@/components/atlas/found-country-form.vue';
import FoundTownForm from '@/components/atlas/found-town-form.vue';
import { TERRAIN_LABEL } from '@/components/atlas/terrains';
import { icon } from '@/components/cozy/icons';
import { client } from '@/services/api';
import { useStore } from '@/store';
import { unwrap } from '@/store/open-play';
import { crestUrl } from '@/helpers/crest';
import '@/components/cozy/cozy.scss';

type Step = 'country' | 'town' | 'club' | 'review';
const STEPS: Step[] = ['country', 'town', 'club', 'review'];
const STEP_LABEL: Record<Step, string> = { country: 'Country', town: 'Town', club: 'Club', review: 'Kick-off' };
const STEP_HINT: Record<Step, string> = {
  country: 'Choose a country, or found a new one',
  town: 'Choose your home town',
  club: 'Name it and design the crest',
  review: 'Check everything and found the club',
};

const router = useRouter();
const route = useRoute();
const store = useStore();
store.getUser();

const atlas = ref<Atlas | null>(null);
const loadError = ref('');
const mapRef = ref<InstanceType<typeof AtlasMap> | null>(null);
const step = ref<Step>('country');
const countryId = ref<string | null>(null);
const townId = ref<string | null>(null);
const placing = ref<'country' | 'town' | null>(null);
const pendingSpot = ref<{ x: number; y: number } | null>(null);
const busy = ref(false);
const formError = ref('');
const done = ref<FoundedClub | null>(null);
const toast = ref<{ text: string; tone: 'good' | 'bad' } | null>(null);

const clubForm = reactive({ name: '', code: '', codeTouched: false, stadium: '' });
const crest = ref<CrestDesign>(randomCrest(store.user.username || 'new club'));
const nameCheck = reactive({ ok: false, problem: null as string | null, checking: false });

const firstClubId = computed(() => {
  const c = store.user.clubs?.[0];
  return typeof c === 'string' ? c : (c as { _id?: string } | undefined)?._id;
});
const hasClub = computed(() => !!firstClubId.value);
const myClubIds = computed(() => new Set(atlas.value?.me?.clubIds ?? []));

const country = computed(() => atlas.value?.countries.find((c) => c.id === countryId.value) ?? null);
const town = computed(() => atlas.value?.towns.find((t) => t.id === townId.value) ?? null);
const countryList = computed(() =>
  (atlas.value?.countries ?? [])
    .map((c) => {
      const towns = atlas.value!.towns.filter((t) => t.countryId === c.id);
      return { ...c, towns: towns.length, clubs: towns.reduce((n, t) => n + t.clubs.length, 0) };
    })
    .sort((a, b) => b.clubs - a.clubs || a.name.localeCompare(b.name))
);
const townList = computed(() =>
  (atlas.value?.towns ?? [])
    .filter((t) => t.countryId === countryId.value)
    .map((t) => ({ ...t, full: t.clubs.length >= TOWN_MAX_CLUBS }))
    .sort((a, b) => Number(a.full) - Number(b.full) || a.name.localeCompare(b.name))
);
const mapSelection = computed<AtlasPick | null>(() =>
  townId.value ? { kind: 'town', id: townId.value } : countryId.value ? { kind: 'country', id: countryId.value } : null
);

// Frame the map in the space the panel leaves (right on wide screens,
// above the bottom sheet on phones).
const viewport = reactive({ w: window.innerWidth, h: window.innerHeight });
const onResize = () => Object.assign(viewport, { w: window.innerWidth, h: window.innerHeight });
const insets = computed(() =>
  viewport.w <= 760
    ? { top: 70, bottom: Math.round(viewport.h * 0.56) + 16 }
    : { top: 90, right: (step.value === 'club' && !placing.value ? 640 : 400) + 90 }
);

const stepIndex = computed(() => STEPS.indexOf(step.value));
const clubReady = computed(() => !!clubForm.name.trim() && /^[A-Z][A-Z0-9]{1,3}$/.test(clubForm.code) && !nameCheck.problem && !nameCheck.checking);
const maxReachable = computed(() => (!countryId.value ? 0 : !townId.value ? 1 : !clubReady.value ? 2 : 3));

function canFound(kind: 'countries' | 'towns') {
  const me = atlas.value?.me;
  if (!me) return false;
  return me.founded[kind] < (me.limits[kind] ?? FOUNDING_LIMITS[kind]);
}

function say(text: string, tone: 'good' | 'bad' = 'good') {
  toast.value = { text, tone };
  setTimeout(() => toast.value?.text === text && (toast.value = null), 3200);
}

async function loadAtlas() {
  try {
    atlas.value = unwrap<Atlas>(await client.atlas.getAtlas.query());
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err);
  }
}

function goTo(s: Step) {
  if (STEPS.indexOf(s) > maxReachable.value) return;
  cancelPlacing();
  step.value = s;
  if (s === 'country') mapRef.value?.fitAll();
  else if (countryId.value && s === 'town') mapRef.value?.focusCountry(countryId.value);
  else if (town.value) mapRef.value?.focusPoint(town.value.x, town.value.y, 300);
}

function selectCountry(id: string) {
  if (countryId.value !== id) townId.value = null;
  countryId.value = id;
  mapRef.value?.focusCountry(id);
}

function selectTown(id: string) {
  const t = atlas.value?.towns.find((x) => x.id === id);
  if (!t || t.clubs.length >= TOWN_MAX_CLUBS) return;
  townId.value = id;
  countryId.value = t.countryId;
  mapRef.value?.focusPoint(t.x, t.y, 300);
  if (!clubForm.name) crest.value = { ...crest.value };
}

function onMapSelect(p: AtlasPick | null) {
  if (!p || placing.value) return;
  if (p.kind === 'country' && step.value === 'country') selectCountry(p.id);
  else if (p.kind === 'country' && step.value === 'town' && p.id !== countryId.value) {
    selectCountry(p.id);
  } else if (p.kind === 'town' && (step.value === 'country' || step.value === 'town')) {
    selectTown(p.id);
    if (townId.value === p.id) step.value = 'town';
  } else if (p.kind === 'club') {
    const t = atlas.value?.towns.find((x) => x.clubs.some((c) => c.id === p.id));
    if (t && step.value !== 'club' && step.value !== 'review') selectTown(t.id);
  }
}

function startPlacing(kind: 'country' | 'town') {
  formError.value = '';
  pendingSpot.value = null;
  placing.value = kind;
  if (kind === 'country') mapRef.value?.fitAll();
}

function cancelPlacing() {
  placing.value = null;
  pendingSpot.value = null;
  formError.value = '';
}

function onPlace(spot: { x: number; y: number; problem: string | null }) {
  if (spot.problem) {
    say(spot.problem, 'bad');
    return;
  }
  pendingSpot.value = { x: spot.x, y: spot.y };
  placing.value = null;
}

function autoCode(form: { name: string; code: string; codeTouched: boolean }) {
  if (!form.codeTouched) form.code = suggestCode(form.name);
}

async function onCountryFounded(c: { id: string; name: string }) {
  say(`${c.name} is founded!`);
  pendingSpot.value = null;
  await loadAtlas();
  selectCountry(c.id);
  step.value = 'town';
  startPlacing('town');
}

async function onTownFounded(t: { id: string; name: string }) {
  say(`${t.name} is on the map!`);
  pendingSpot.value = null;
  await loadAtlas();
  selectTown(t.id);
}

let checkTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleCheck() {
  clearTimeout(checkTimer);
  nameCheck.checking = true;
  checkTimer = setTimeout(async () => {
    try {
      const r = unwrap<{ ok: boolean; problem: string | null }>(
        await client.atlas.checkName.query({ query: { kind: 'club', name: clubForm.name, code: clubForm.code || undefined } })
      );
      nameCheck.ok = r.ok;
      nameCheck.problem = clubForm.name.trim() ? r.problem : null;
    } catch {
      nameCheck.problem = null;
    } finally {
      nameCheck.checking = false;
    }
  }, 350);
}
function onClubName() {
  autoCode(clubForm);
  scheduleCheck();
}
function onClubCode() {
  clubForm.code = clubForm.code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  clubForm.codeTouched = true;
  scheduleCheck();
}
watch(
  () => clubForm.code,
  (code) => (crest.value = { ...crest.value, initials: code.slice(0, 4) })
);

async function submitClub() {
  if (!townId.value) return;
  busy.value = true;
  formError.value = '';
  try {
    const founded = unwrap<FoundedClub>(
      await client.atlas.foundClub.mutation({
        body: { townId: townId.value, name: clubForm.name, code: clubForm.code, crest: crest.value, stadiumName: clubForm.stadium || undefined },
      })
    );
    done.value = founded;
    const ids = (store.user.clubs ?? []).map((c) => (typeof c === 'string' ? c : (c as { _id: string })._id));
    store.setUser({ ...store.user, clubs: [founded.clubId, ...ids.filter((id) => id !== founded.clubId)] });
    await loadAtlas();
    if (town.value) mapRef.value?.focusPoint(town.value.x, town.value.y, 220);
  } catch (err) {
    formError.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  await loadAtlas();
  // Deep links from the world map: /start?town=<id> or ?country=<id>.
  const town = typeof route.query.town === 'string' ? atlas.value?.towns.find((t) => t.id === route.query.town) : null;
  const countryQ = typeof route.query.country === 'string' ? route.query.country : null;
  if (town && town.clubs.length < TOWN_MAX_CLUBS) {
    countryId.value = town.countryId;
    townId.value = town.id;
    step.value = 'club';
    setTimeout(() => mapRef.value?.focusPoint(town.x, town.y, 300), 50);
  } else if (countryQ && atlas.value?.countries.some((c) => c.id === countryQ)) {
    countryId.value = countryQ;
    step.value = 'town';
    setTimeout(() => mapRef.value?.focusCountry(countryQ), 50);
  }
  window.addEventListener('resize', onResize);
});
onBeforeUnmount(() => window.removeEventListener('resize', onResize));
</script>

<style scoped>
.found {
  background: #5aaedb;
}
.found-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 22px;
  font-weight: 600;
  color: #fff;
}
.found-head {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  pointer-events: none;
}
.found-head > * {
  pointer-events: auto;
}
.found-title {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px 8px 10px;
  border-radius: 18px;
  background: var(--cream);
  border: 3px solid #c9a46a;
  box-shadow: var(--shadow);
}
.found-title :deep(.ic) {
  width: 36px;
  height: 36px;
}
.found-title b {
  display: block;
  font-size: 22px;
  line-height: 1.1;
}
.found-title small {
  color: var(--muted);
  font-size: 13px;
}
.found-steps {
  display: flex;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.found-steps button {
  padding: 5px 12px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 14px;
  background: rgba(255, 250, 240, 0.85);
  border: 2px solid #e2cc9c;
  color: var(--muted);
}
.found-steps li.past button {
  color: var(--green-d);
  border-color: #bfe3a5;
}
.found-steps li.on button {
  background: var(--green);
  border-color: var(--green-d);
  color: #fff;
}
.found-panel {
  position: absolute;
  top: 96px;
  right: 70px;
  bottom: 16px;
  width: min(400px, calc(100vw - 32px));
  overflow: auto;
  padding: 16px 18px;
  border-radius: 20px;
  background: var(--cream);
  border: 4px solid #c9a46a;
  box-shadow: var(--shadow);
  animation: pop 0.2s ease-out;
  user-select: text;
}
.found-panel.wide {
  width: min(640px, calc(100vw - 32px));
}
.found-panel h2 {
  margin: 0 0 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 24px;
}
.found-panel h2 :deep(.ic) {
  width: 30px;
  height: 30px;
}
.list {
  list-style: none;
  margin: 8px 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 12px;
  background: #fffaf0;
  border: 2px solid #eadbb8;
  text-align: left;
}
.item:hover:not(:disabled) {
  border-color: var(--green);
}
.item.on {
  border-color: var(--green-d);
  background: #eaf8e0;
  box-shadow: 0 2px 0 var(--green-d);
}
.item.off {
  opacity: 0.55;
}
.item .grow {
  flex: 1;
  min-width: 0;
}
.item b {
  display: block;
  font-size: 16px;
}
.item small {
  color: var(--muted);
  font-size: 12px;
}
.empty {
  padding: 12px;
  text-align: center;
  color: var(--muted);
}
.crests {
  display: flex;
}
.crests img {
  width: 22px;
  height: 24px;
  margin-left: -4px;
}
.note {
  margin-top: 8px;
  font-size: 13px;
  color: var(--muted);
  text-align: center;
}
.review {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 8px 0;
}
.review h3 {
  margin: 0;
  font-size: 22px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.btn.big {
  padding: 12px 22px;
  font-size: 19px;
}
.done {
  text-align: center;
}
.done h2 {
  justify-content: center;
  font-size: 28px;
  margin-top: 8px;
}
.pop {
  animation: found-pop 0.7s cubic-bezier(0.2, 1.6, 0.4, 1);
  filter: drop-shadow(0 8px 0 rgba(70, 40, 15, 0.25));
}
@keyframes found-pop {
  from {
    transform: scale(0.3) rotate(-12deg);
    opacity: 0;
  }
}
@media (max-width: 760px) {
  .found-head {
    top: 8px;
    left: 8px;
    right: 8px;
  }
  .found-title b {
    font-size: 18px;
  }
  .found-steps {
    display: none;
  }
  .found-panel,
  .found-panel.wide {
    top: auto;
    right: 8px;
    left: 8px;
    bottom: 8px;
    width: auto;
    max-height: 56vh;
  }
}
</style>
