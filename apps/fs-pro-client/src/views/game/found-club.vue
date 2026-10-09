<template>
  <div class="cozy found">
    <world-tiles-map
      ref="mapRef"
      :selected="mapSelection"
      :pending="pendingSpot"
      :focus-country-id="placement?.country?.id ?? null"
      :my-club-ids="tiles.myClubIds"
      :insets="insets"
    />
    <div v-if="!tiles.ready" class="found-loading">
      {{ loadError || tiles.error || 'Unrolling the map…' }}
    </div>

    <header class="found-head">
      <div class="found-title">
        <span v-html="icon('star')"></span>
        <div>
          <b>{{ done ? 'Welcome to the world' : 'Found your club' }}</b>
          <small v-if="!done">{{ STEP_HINT[step] }}</small>
        </div>
      </div>
      <ol v-if="!done && !gateOwnedClub" class="found-steps" aria-label="Steps">
        <li
          v-for="(s, i) in STEPS"
          :key="s"
          :class="{ on: s === step, past: i < stepIndex }"
        >
          <button type="button" :disabled="i > maxReachable" @click="goTo(s)">
            {{ i + 1 }}. {{ STEP_LABEL[s] }}
          </button>
        </li>
      </ol>
      <button
        v-if="hasClub && !done && !gateOwnedClub"
        class="btn small"
        type="button"
        @click="router.push(`/game/${firstClubId}`)"
      >
        Back to my club
      </button>
    </header>

    <aside v-if="gateOwnedClub" class="found-panel">
      <h2>
        <span v-html="icon('people')"></span>
        You already run a club
      </h2>
      <p class="sub">
        You're signed in as an owner. Founding again would start a second club —
        only do that if you mean to. Your existing club is one tap away.
      </p>
      <div class="row-btns sticky">
        <button
          class="btn primary big"
          type="button"
          @click="router.push(`/game/${firstClubId}`)"
        >
          Back to my club
        </button>
        <button class="btn" type="button" @click="foundingAnyway = true">
          Found another club
        </button>
      </div>
    </aside>

    <aside v-else class="found-panel" :class="{ wide: step === 'club' }">
      <!-- 1. Home: where placement puts the club, and names for new places -->
      <template v-if="step === 'home'">
        <h2>
          <span v-html="icon('map')"></span>
          Your home
        </h2>
        <p v-if="!placement" class="sub">Finding you a spot…</p>
        <template v-else>
          <div
            v-if="placement.invite"
            class="warn"
            :class="{
              good: placement.invite.valid && !placement.invite.problem,
            }"
          >
            <template
              v-if="placement.invite.valid && !placement.invite.problem"
            >
              {{ placement.invite.byClubName }} invited you to
              {{ placement.invite.townName }}.
            </template>
            <template v-else>{{ placement.invite.problem }}</template>
          </div>

          <template v-if="placement.kind === 'town' && placement.town">
            <p class="sub">
              The world fills up town by town, so you'll have neighbours from
              day one.
            </p>
            <div class="place-card">
              <span
                class="tdot"
                :class="placement.town.terrain"
                aria-hidden="true"
              ></span>
              <div class="grow">
                <b>{{ placement.town.name }}</b>
                <small>
                  {{
                    [placement.region?.name, placement.country?.name]
                      .filter(Boolean)
                      .join(', ')
                  }}
                  · {{ TERRAIN_LABEL[placement.town.terrain] }} ·
                  {{ placement.town.clubCount }}/{{ TOWN_MAX_CLUBS }} clubs
                </small>
              </div>
            </div>
            <p class="sub">
              You'll join {{ placement.country?.name }}'s league pyramid
              straight away, against the clubs around you.
            </p>
          </template>

          <template v-else>
            <p class="sub">
              <template v-if="placement.needs.country">
                Every country is full. You're the first club of a brand new
                nation: name it.
              </template>
              <template v-else-if="placement.needs.region">
                {{ placement.country?.name }} is opening a new region, and
                you're its first club.
              </template>
              <template v-else>
                {{ placement.region?.name }} in
                {{ placement.country?.name }} needs a new town, and you're its
                first club.
              </template>
            </p>
            <form class="form" @submit.prevent="goTo('club')">
              <template v-if="placement.needs.country">
                <div class="two">
                  <label>
                    Country
                    <input
                      v-model="newCountry.name"
                      maxlength="30"
                      placeholder="e.g. Verdania"
                      @input="
                        !newCountry.codeTouched &&
                        (newCountry.code = suggestCode(newCountry.name))
                      "
                    />
                  </label>
                  <label>
                    Code
                    <input
                      v-model="newCountry.code"
                      maxlength="4"
                      class="code"
                      @input="
                        newCountry.code = newCountry.code
                          .toUpperCase()
                          .replace(/[^A-Z0-9]/g, '');
                        newCountry.codeTouched = true;
                      "
                    />
                  </label>
                </div>
                <div class="label">Flag</div>
                <div class="flagpick">
                  <div v-for="i in [0, 1]" :key="i" class="swatches">
                    <button
                      v-for="c in CREST_PALETTE"
                      :key="c"
                      type="button"
                      class="sw"
                      :class="{ on: newCountry.colors[i] === c }"
                      :style="{ background: c }"
                      :aria-label="`Flag colour ${i + 1}: ${c}`"
                      @click="newCountry.colors[i] = c"
                    ></button>
                  </div>
                  <div class="flag big" aria-hidden="true">
                    <i :style="{ background: newCountry.colors[0] }"></i>
                    <i :style="{ background: newCountry.colors[1] }"></i>
                  </div>
                </div>
                <label>
                  <span>
                    Motto
                    <small>(optional)</small>
                  </span>
                  <input
                    v-model="newCountry.motto"
                    maxlength="80"
                    placeholder="Unity, Football, Biscuits"
                  />
                </label>
              </template>
              <label v-if="placement.needs.region">
                Region
                <input
                  v-model="newRegion.name"
                  maxlength="30"
                  placeholder="e.g. The Northern Reach"
                />
              </label>
              <template v-if="placement.needs.town">
                <label>
                  Town
                  <input
                    v-model="newTown.name"
                    maxlength="30"
                    placeholder="e.g. Port Ellis"
                  />
                </label>
                <div class="label">
                  Setting
                  <small>(sets the look of every club's grounds here)</small>
                </div>
                <div class="terrains">
                  <button
                    v-for="t in TERRAINS"
                    :key="t.key"
                    type="button"
                    class="terrain"
                    :class="[t.key, { on: newTown.terrain === t.key }]"
                    @click="newTown.terrain = t.key"
                  >
                    <span class="t-art" aria-hidden="true"></span>
                    <b>{{ t.label }}</b>
                    <small>{{ t.blurb }}</small>
                  </button>
                </div>
              </template>
              <p v-if="placeProblem" class="warn">{{ placeProblem }}</p>
            </form>
          </template>
          <p v-if="formError" class="warn">{{ formError }}</p>
          <p v-if="needsEmail" class="warn">
            <span>
              {{ resent || 'We emailed you a link when you signed up.' }}
            </span>
            <button
              class="btn small"
              type="button"
              :disabled="resending"
              @click="resendEmail"
            >
              Send it again
            </button>
          </p>
          <div class="row-btns sticky">
            <button
              class="btn primary"
              type="button"
              :disabled="!homeReady"
              @click="goTo('club')"
            >
              Next: your club
            </button>
          </div>
        </template>
      </template>

      <!-- 2. Club -->
      <template v-else-if="step === 'club'">
        <h2>
          <span v-html="icon('people')"></span>
          Your club
        </h2>
        <form class="form club-form" @submit.prevent="goTo('review')">
          <div class="two">
            <label>
              Club name
              <input
                v-model="clubForm.name"
                maxlength="40"
                :placeholder="`${townName} United`"
                @input="onClubName"
              />
            </label>
            <label>
              Code
              <input
                v-model="clubForm.code"
                maxlength="4"
                class="code"
                @input="onClubCode"
              />
            </label>
          </div>
          <label>
            <span>
              Ground
              <small>(stadium name)</small>
            </span>
            <input
              v-model="clubForm.stadium"
              maxlength="40"
              :placeholder="`${townName} Park`"
            />
          </label>
          <p v-if="nameCheck.problem" class="warn">{{ nameCheck.problem }}</p>
          <p v-else-if="nameCheck.ok && clubForm.name.trim()" class="warn good">
            {{ clubForm.name.trim() }} is free
          </p>
          <crest-designer v-model="crest" />
          <div class="row-btns sticky">
            <button class="btn" type="button" @click="goTo('home')">
              Back
            </button>
            <button class="btn primary" type="submit" :disabled="!clubReady">
              Next: kick-off
            </button>
          </div>
        </form>
      </template>

      <!-- 3. Review / done -->
      <template v-else-if="step === 'review'">
        <template v-if="!done">
          <h2>
            <span v-html="icon('ball')"></span>
            Kick-off
          </h2>
          <div class="review">
            <img
              :src="crestDataUrl(crest, 'review')"
              alt=""
              width="110"
              height="123"
            />
            <div>
              <h3>
                {{ clubForm.name.trim() }}
                <span class="lv">{{ clubForm.code }}</span>
              </h3>
              <p class="sub">
                {{ whereLine }} ·
                {{ clubForm.stadium.trim() || `${townName} Park` }}
              </p>
            </div>
          </div>
          <div class="stats-row">
            <div>
              <small>Bank</small>
              <b>1.5M</b>
            </div>
            <div>
              <small>Squad</small>
              <b>16</b>
            </div>
            <div>
              <small>Level</small>
              <b>0</b>
            </div>
            <div>
              <small>Fans</small>
              <b>150</b>
            </div>
          </div>
          <p class="sub">
            You start from nothing: a dirt pitch, hopeful amateurs, a few loyal
            fans. Your league fixtures start right away. Win matches to earn
            money and XP, then build your grounds up.
          </p>
          <p v-if="formError" class="warn">{{ formError }}</p>
          <p v-if="needsEmail" class="warn">
            <span>
              {{
                resent ||
                'We emailed you a link when you signed up. Open it, then come back and try again.'
              }}
            </span>
            <button
              class="btn small"
              type="button"
              :disabled="resending"
              @click="resendEmail"
            >
              Send it again
            </button>
          </p>
          <div class="row-btns sticky">
            <button class="btn" type="button" @click="goTo('club')">
              Back
            </button>
            <button
              class="btn primary big"
              type="button"
              :disabled="busy"
              @click="submitClub"
            >
              {{ busy ? 'Founding…' : `Found ${clubForm.name.trim()}` }}
            </button>
          </div>
        </template>
        <template v-else>
          <div class="done">
            <img
              :src="crestDataUrl(crest, 'done')"
              alt=""
              width="130"
              height="146"
              class="pop"
            />
            <h2>{{ clubForm.name.trim() }} is born!</h2>
            <p class="sub">
              {{ done.town.name
              }}{{ done.region ? `, ${done.region.name}` : '' }},
              {{ done.country.name }} has a new club.
              <template v-if="done.opened.includes('country')">
                You founded a nation.
              </template>
              <template v-else-if="done.opened.includes('town')">
                You put {{ done.town.name }} on the map.
              </template>
            </p>
            <div v-if="done.pool" class="warn good">
              You start in {{ done.pool.name }}: your fixtures are already on
              the calendar.
            </div>
            <p class="sub">
              Bring friends: invite links from your town page put them in
              {{ done.town.name }} with you.
            </p>
            <div class="row-btns sticky">
              <button
                class="btn primary big"
                type="button"
                @click="router.push(`/game/${done.clubId}?welcome=1`)"
              >
                Go to your ground
              </button>
            </div>
          </div>
        </template>
      </template>
    </aside>

    <div class="toasts">
      <div v-if="toast" class="toast" :class="toast.tone">{{ toast.text }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  CREST_PALETTE,
  TOWN_MAX_CLUBS,
  codeProblem,
  crestDataUrl,
  nameProblem,
  randomCrest,
  suggestCode,
  type CrestDesign,
  type FoundedClub,
  type Placement,
  type TownTerrain,
} from '@repo/api-contract';
import WorldTilesMap, {
  type AtlasPick,
} from '@/components/atlas/world-tiles-map.vue';
import CrestDesigner from '@/components/atlas/crest-designer.vue';
import { TERRAINS, TERRAIN_LABEL } from '@/components/atlas/terrains';
import { icon } from '@/components/cozy/icons';
import { client } from '@/services/api';
import { useStore } from '@/store';
import { unwrap } from '@/store/open-play';
import { useWorldTilesStore } from '@/store/world-tiles';
import '@/components/cozy/cozy.scss';

/**
 * Founding a club (docs/WORLD-PYRAMID-SPEC.md, "Geography and placement").
 * The world decides where the club goes: the next town with room, or a new
 * town, region or country that the founder names. An invite link
 * (/start?invite=TOKEN) puts the club in a friend's town instead.
 */

type Step = 'home' | 'club' | 'review';
const STEPS: Step[] = ['home', 'club', 'review'];
const STEP_LABEL: Record<Step, string> = {
  home: 'Home',
  club: 'Club',
  review: 'Kick-off',
};
const STEP_HINT: Record<Step, string> = {
  home: 'See where you start, and name any new places',
  club: 'Name it and design the crest',
  review: 'Check everything and found the club',
};

const router = useRouter();
const route = useRoute();
const store = useStore();
store.getUser();
const tiles = useWorldTilesStore();

const placement = ref<Placement | null>(null);
const loadError = ref('');
const mapRef = ref<InstanceType<typeof WorldTilesMap> | null>(null);
const step = ref<Step>('home');
const busy = ref(false);
const formError = ref('');
const needsEmail = computed(() => /confirm your email/i.test(formError.value));
const resending = ref(false);
const resent = ref('');

async function resendEmail() {
  resending.value = true;
  try {
    const res = await client.users.resendVerification.mutation({ body: {} });
    resent.value = (res.body as { message?: string }).message ?? 'Sent';
  } catch {
    resent.value = 'Could not send the link. Try again in a minute.';
  } finally {
    resending.value = false;
  }
}
const done = ref<FoundedClub | null>(null);
const toast = ref<{ text: string; tone: 'good' | 'bad' } | null>(null);
const invite =
  typeof route.query.invite === 'string' ? route.query.invite : undefined;

const newCountry = reactive({
  name: '',
  code: '',
  codeTouched: false,
  colors: ['#2f8a1c', '#f5b82e'] as [string, string],
  motto: '',
});
const newRegion = reactive({ name: '' });
const newTown = reactive({ name: '', terrain: 'city' as TownTerrain });
const clubForm = reactive({
  name: '',
  code: '',
  codeTouched: false,
  stadium: '',
});
const crest = ref<CrestDesign>(randomCrest(store.user.username || 'new club'));
const nameCheck = reactive({
  ok: false,
  problem: null as string | null,
  checking: false,
});

const firstClubId = computed(() => {
  const c = store.user.clubs?.[0];
  return typeof c === 'string' ? c : (c as { _id?: string } | undefined)?._id;
});
const hasClub = computed(() => !!firstClubId.value);
/** An owner opening /start with no invite sees a gate, not the wizard (U-04). */
const foundingAnyway = ref(false);
const gateOwnedClub = computed(
  () => hasClub.value && !invite && !foundingAnyway.value && !done.value
);

const townName = computed(
  () => placement.value?.town?.name ?? (newTown.name.trim() || 'Town')
);
const whereLine = computed(() => {
  const p = placement.value;
  if (!p) return '';
  const region =
    p.region?.name ?? (p.needs.region ? newRegion.name.trim() : '');
  const country = p.country?.name ?? newCountry.name.trim();
  return [townName.value, region, country].filter(Boolean).join(', ');
});
const pendingSpot = computed(() =>
  placement.value && placement.value.kind !== 'town'
    ? { x: placement.value.x, y: placement.value.y }
    : null
);
/** Highlight the placed city: migration 0038 renamed the old town level to
 * city, and the map's z3 markers are cities. */
const mapSelection = computed<AtlasPick | null>(() =>
  placement.value?.town ? { kind: 'city', id: placement.value.town.id } : null
);

/** What's wrong with the new place names, if anything. */
const placeProblem = computed(() => {
  const p = placement.value;
  if (!p) return null;
  if (p.needs.country) {
    const c =
      nameProblem(newCountry.name, 'Country name') ??
      codeProblem(newCountry.code, 'Country code');
    if (c) return newCountry.name ? c : null;
  }
  if (p.needs.region && newRegion.name) {
    const r = nameProblem(newRegion.name, 'Region name');
    if (r) return r;
  }
  if (p.needs.town && newTown.name) {
    const t = nameProblem(newTown.name, 'Town name');
    if (t) return t;
    if (
      p.needs.region &&
      newRegion.name.trim().toLowerCase() === newTown.name.trim().toLowerCase()
    )
      return 'The town and its region need different names';
  }
  return null;
});
const homeReady = computed(() => {
  const p = placement.value;
  if (!p) return false;
  if (
    p.needs.country &&
    (nameProblem(newCountry.name, 'x') || codeProblem(newCountry.code, 'x'))
  )
    return false;
  if (p.needs.region && nameProblem(newRegion.name, 'x')) return false;
  if (p.needs.town && nameProblem(newTown.name, 'x')) return false;
  return !placeProblem.value;
});

// Frame the map in the space the panel leaves (right on wide screens,
// above the bottom sheet on phones).
const viewport = reactive({ w: window.innerWidth, h: window.innerHeight });
const onResize = () =>
  Object.assign(viewport, { w: window.innerWidth, h: window.innerHeight });
const insets = computed(() =>
  viewport.w <= 760
    ? { top: 70, bottom: Math.round(viewport.h * 0.56) + 16 }
    : { top: 90, right: (step.value === 'club' ? 640 : 400) + 90 }
);

const stepIndex = computed(() => STEPS.indexOf(step.value));
const clubReady = computed(
  () =>
    !!clubForm.name.trim() &&
    /^[A-Z][A-Z0-9]{1,3}$/.test(clubForm.code) &&
    !nameCheck.problem &&
    !nameCheck.checking
);
const maxReachable = computed(() =>
  !homeReady.value ? 0 : !clubReady.value ? 1 : 2
);

function say(text: string, tone: 'good' | 'bad' = 'good') {
  toast.value = { text, tone };
  setTimeout(() => toast.value?.text === text && (toast.value = null), 3200);
}

async function loadPlacement() {
  placement.value = unwrap<Placement>(
    await client.atlas.getPlacement.query({ query: { invite } })
  );
}

/** The world-service tiles are the map source (the whole-world atlas is
 * retired, WORLD-HIERARCHY-SPEC §7); chrome carries the country colours. */
function loadMap() {
  tiles.reset();
  void tiles.loadChrome();
}

function focusHome() {
  const p = placement.value;
  if (p) setTimeout(() => mapRef.value?.focusPoint(p.x, p.y, 300), 50);
}

function goTo(s: Step) {
  if (STEPS.indexOf(s) > maxReachable.value) return;
  step.value = s;
  focusHome();
}

let checkTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleCheck() {
  clearTimeout(checkTimer);
  nameCheck.checking = true;
  checkTimer = setTimeout(async () => {
    try {
      const r = unwrap<{ ok: boolean; problem: string | null }>(
        await client.atlas.checkName.query({
          query: {
            kind: 'club',
            name: clubForm.name,
            code: clubForm.code || undefined,
          },
        })
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
  if (!clubForm.codeTouched) clubForm.code = suggestCode(clubForm.name);
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
  const p = placement.value;
  if (!p) return;
  busy.value = true;
  formError.value = '';
  try {
    const founded = unwrap<FoundedClub>(
      await client.atlas.foundClub.mutation({
        body: {
          invite,
          ...(p.needs.country
            ? {
                newCountry: {
                  name: newCountry.name,
                  code: newCountry.code,
                  colors: [newCountry.colors[0], newCountry.colors[1]],
                  motto: newCountry.motto || undefined,
                },
              }
            : {}),
          ...(p.needs.region ? { newRegion: { name: newRegion.name } } : {}),
          ...(p.needs.town
            ? { newTown: { name: newTown.name, terrain: newTown.terrain } }
            : {}),
          name: clubForm.name,
          code: clubForm.code,
          crest: crest.value,
          stadiumName: clubForm.stadium || undefined,
        },
      })
    );
    done.value = founded;
    const ids = (store.user.clubs ?? []).map((c) =>
      typeof c === 'string' ? c : (c as { _id: string })._id
    );
    store.setUser({
      ...store.user,
      clubs: [founded.clubId, ...ids.filter((id) => id !== founded.clubId)],
    });
    // The new club is in a tile the client already holds; refetch the view so
    // it appears, and frame the spot we founded at.
    tiles.invalidate();
    setTimeout(() => mapRef.value?.focusPoint(p.x, p.y, 160), 60);
    say(`${founded.town.name} welcomes ${clubForm.name.trim()}!`);
  } catch (err) {
    formError.value = err instanceof Error ? err.message : String(err);
    // The world moved on (someone took the spot, or new places need names):
    // show where the club would go now.
    const before = placement.value?.kind;
    await loadPlacement().catch(() => undefined);
    if (
      placement.value &&
      (placement.value.kind !== before || placement.value.kind !== 'town')
    ) {
      step.value = 'home';
      focusHome();
    }
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  try {
    await loadPlacement();
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err);
  }
  loadMap();
  focusHome();
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
.place-card {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 0;
  padding: 10px 12px;
  border-radius: 14px;
  background: #eaf8e0;
  border: 2px solid var(--green-d);
}
.place-card .grow {
  flex: 1;
  min-width: 0;
}
.place-card b {
  display: block;
  font-size: 19px;
}
.place-card small {
  color: var(--muted);
  font-size: 13px;
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
