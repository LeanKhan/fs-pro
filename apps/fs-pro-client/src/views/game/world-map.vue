<template>
  <div class="cozy world">
    <world-tiles-map
      ref="mapRef"
      :selected="selected"
      :venues="venues"
      :my-club-ids="tiles.myClubIds"
      :highlight-club-ids="rivalIds"
      :pending="pending"
      :focus-country-id="focusCountryId"
      :insets="insets"
      @select="onSelect"
    />

    <!-- Top left: back home, the world in numbers, and search -->
    <header class="world-head">
      <button v-if="myClub" class="home" :title="`Back to ${myClub.Name}`" @click="router.push(`/game/${myClub._id}`)">
        <img :src="crestUrl(myClub.ClubCode)" :alt="myClub.Name" width="44" height="48" />
      </button>
      <div class="world-title">
        <b>The World</b>
        <small>{{ tiles.countries.length }} countries · {{ tiles.clubs.length }} clubs shown<template v-if="tiles.loading"> · loading…</template></small>
      </div>
      <div class="world-search">
        <input
          v-model="query"
          type="search"
          placeholder="Find a club or place…"
          aria-label="Search clubs and places"
          @input="onSearchInput"
          @keydown.escape="results = []"
        />
        <ul v-if="results.length" class="results">
          <li v-for="r in results" :key="`${r.kind}-${r.id}`">
            <button @click="goResult(r)">
              <b>{{ r.name }}</b>
              <small>{{ r.kind }}</small>
            </button>
          </li>
        </ul>
      </div>
      <button v-if="tiles.myHome" class="btn small mine-jump" type="button" @click="jumpHome">My club</button>
      <nav class="filters" aria-label="Show">
        <button v-for="f in FILTERS" :key="f.key" :class="{ on: filter === f.key }" @click="filter = f.key">{{ f.label }}</button>
      </nav>
    </header>

    <div v-if="tiles.error" class="world-error">{{ tiles.error }}</div>

    <!-- Right: whatever is selected, or the world overview -->
    <aside class="world-panel">
      <!-- A club -->
      <template v-if="selectedClub">
        <div class="card-head">
          <img :src="crestUrl(selectedClub.code)" :alt="selectedClub.name" width="64" height="70" />
          <div>
            <h2>{{ selectedClub.name }}</h2>
            <p class="sub">{{ selectedClub.kindLine }}</p>
            <span v-if="selectedClub.human" class="tag human"><span v-html="icon('people')"></span>Managed by a person</span>
            <span v-else class="tag">AI club</span>
            <span v-if="tiles.myClubIds.has(selectedClub.id)" class="tag mine">Yours</span>
          </div>
        </div>
        <div class="stats-row">
          <div><small>Level</small><b>{{ selectedClub.level }}</b></div>
          <div><small>Power</small><b>{{ selectedClub.power }}</b></div>
          <div><small>Elo</small><b>{{ selectedClub.elo }}</b></div>
          <div><small>Fans</small><b>{{ selectedClub.fans }}</b></div>
        </div>
        <p v-if="formOf(selectedClub.id).length" class="form-line">
          Form <i v-for="(r, i) in formOf(selectedClub.id)" :key="i" :class="`res-${r.toLowerCase()}`">{{ r }}</i>
        </p>
        <p class="sub">Prominence {{ Math.round(selectedClub.prominence) }} / 100 — how big this club looms on the world map.</p>
        <div class="row-btns">
          <button class="btn" @click="router.push(`/game/${selectedClub.id}`)">Visit ground</button>
          <button
            v-if="myClub && !tiles.myClubIds.has(selectedClub.id)"
            class="btn primary"
            :disabled="!canChallengeAnyone"
            :title="canChallengeAnyone ? '' : 'Enter a league to send challenges'"
            @click="showChallenge = true"
          >
            Challenge
          </button>
        </div>
        <p v-if="myClub && !canChallengeAnyone && !tiles.myClubIds.has(selectedClub.id)" class="note">
          Challenges are for league games: enter a league (the trophy markers on the map) first. PLAY at your ground matches you any time.
        </p>
      </template>

      <!-- A place: region, city or district -->
      <template v-else-if="selectedPlace">
        <h2><span class="tdot" :class="selectedPlace.kind" aria-hidden="true"></span>{{ selectedPlace.name }}</h2>
        <p class="sub">
          {{ selectedPlace.kind }}<template v-if="selectedPlace.countryName"> in {{ selectedPlace.countryName }}</template>
          · {{ selectedPlace.clubs }} club{{ selectedPlace.clubs === 1 ? '' : 's' }}
        </p>
        <ul class="list">
          <li v-for="c in selectedPlace.near" :key="c.id">
            <button class="item" @click="onSelect({ kind: 'club', id: c.id })">
              <img :src="crestUrl(c.code)" :alt="c.name" width="30" height="33" />
              <span class="grow"><b>{{ c.name }}</b><small>{{ c.human ? 'Managed by a person' : 'AI club' }}</small></span>
            </button>
          </li>
          <li v-if="!selectedPlace.near.length" class="empty">{{ selectedPlace.clubs ? 'Zoom in to meet the clubs.' : 'No clubs yet.' }}</li>
        </ul>
        <!-- Friends join your district through an invite link (docs/WORLD-PYRAMID-SPEC.md, "Invites"). -->
        <template v-if="!isMyPlace(selectedPlace.id)">
          <p class="note">New clubs are placed where the world has room. Friends of a club here can be invited in.</p>
        </template>
        <template v-else>
          <h4>Invite friends to {{ selectedPlace.name }}</h4>
          <p class="sub">Anyone who signs up with your link starts their club here (or next door, if it is full).</p>
          <div v-for="inv in invites" :key="inv.token" class="invite-row">
            <input :value="inviteUrl(inv.token)" readonly @focus="($event.target as HTMLInputElement).select()" />
            <button class="btn small" @click="copyInvite(inv.token)">Copy</button>
            <small>{{ inv.usesLeft }} use{{ inv.usesLeft === 1 ? '' : 's' }} left</small>
          </div>
          <div class="row-btns">
            <button class="btn primary" :disabled="inviting" @click="makeInvite">{{ inviting ? 'Making a link…' : 'New invite link' }}</button>
          </div>
        </template>
      </template>

      <!-- A country -->
      <template v-else-if="selectedCountry">
        <div class="card-head">
          <span class="flag big" aria-hidden="true"><i :style="{ background: selectedCountry.colors[0] }"></i><i :style="{ background: selectedCountry.colors[1] }"></i></span>
          <div>
            <h2>{{ selectedCountry.name }}</h2>
            <p class="sub">
              <template v-if="selectedCountry.founder">Founded by {{ selectedCountry.founder.name }}</template>
              <template v-else>One of the old countries</template>
              <template v-if="selectedCountry.motto"> · “{{ selectedCountry.motto }}”</template>
            </p>
          </div>
        </div>
        <div class="stats-row">
          <div><small>Clubs shown</small><b>{{ clubsInCountry(selectedCountry.id) }}</b></div>
          <div><small>Visible places</small><b>{{ placesInCountry(selectedCountry.id) }}</b></div>
        </div>
        <h4 v-if="nationalVenues(selectedCountry.id).length">Competitions</h4>
        <ul class="list">
          <li v-for="v in nationalVenues(selectedCountry.id)" :key="v.id">
            <button class="item" @click="onSelect({ kind: 'venue', id: v.id })">
              <span class="venue-ic" :style="{ background: v.tint }">{{ v.icon }}</span>
              <span class="grow"><b>{{ v.label }}</b><small>{{ v.status }}</small></span>
            </button>
          </li>
        </ul>
      </template>

      <!-- A competition -->
      <template v-else-if="selectedVenue">
        <h2><span class="venue-ic" :style="{ background: venueById(selectedVenue.id)?.tint }">{{ venueById(selectedVenue.id)?.icon }}</span>{{ selectedVenue.competitionName ?? selectedVenue.title }}</h2>
        <p class="sub">{{ formatSummary(selectedVenue.definition as never) }}</p>
        <v-theme-provider theme="cozy" with-background class="venue-body">
          <stage-timeline :definition="selectedVenue.definition" :current-stage="selectedVenue.currentStage" :status="selectedVenue.status" class="mb-3" />
          <template v-if="selectedVenue.status === 'registration'">
            <p class="sub">Open for entry · closes day {{ selectedVenue.registrationClosesDay }}</p>
            <p v-for="r in selectedVenue.eligibility?.reasons ?? []" :key="r" class="warn">{{ r }}</p>
            <div class="row-btns">
              <button v-if="myClub && !entryFor(selectedVenue.id)" class="btn primary" :disabled="!selectedVenue.eligibility?.eligible || entering" @click="enter(selectedVenue.id)">
                {{ entering ? 'Entering…' : `Enter${selectedVenue.eligibility?.fee ? ` · ${money(selectedVenue.eligibility.fee)}` : ''}` }}
              </button>
              <span v-else-if="entryFor(selectedVenue.id)" class="tag mine">You're entered</span>
            </div>
          </template>
          <edition-standings
            v-else
            :edition-id="selectedVenue.id"
            :definition="selectedVenue.definition"
            :current-stage="selectedVenue.currentStage"
            :status="selectedVenue.status"
            :highlight-club-id="openPlay.clubId"
            compact
          />
        </v-theme-provider>
        <div class="row-btns"><router-link class="btn" :to="`/u/competitions/${selectedVenue.id}`">Competition page</router-link></div>
      </template>

      <!-- Nothing selected: the world at a glance -->
      <template v-else>
        <h2><span v-html="icon('map')"></span>The world</h2>
        <p class="sub">Zoom in from the world to a district, then to its clubs. The world fills place by place: when a country is full, the next club founds a new one.</p>
        <h4 v-if="openVenues.length">Open for entry</h4>
        <ul class="list">
          <li v-for="v in openVenues" :key="v.id">
            <button class="item" @click="onSelect({ kind: 'venue', id: v.id })">
              <span class="venue-ic" :style="{ background: v.tint }">{{ v.icon }}</span>
              <span class="grow"><b>{{ v.label }}</b><small>{{ v.status }}</small></span>
            </button>
          </li>
        </ul>
        <h4>Countries</h4>
        <ul class="list">
          <li v-for="c in countryList" :key="c.id">
            <button class="item" @click="onSelect({ kind: 'country', id: c.id })">
              <span class="flag small" aria-hidden="true"><i :style="{ background: c.colors[0] }"></i><i :style="{ background: c.colors[1] }"></i></span>
              <span class="grow"><b>{{ c.name }}</b><small>{{ c.founder ? `founded by ${c.founder.name}` : 'one of the old countries' }}</small></span>
            </button>
          </li>
        </ul>
        <div class="row-btns sticky">
          <button v-if="tiles.canFoundClub" class="btn primary" @click="router.push('/start')">Found {{ tiles.myClubIds.size ? 'another' : 'a' }} club</button>
        </div>
      </template>
    </aside>

    <cozy-presence />

    <nav class="dock" aria-label="Go to">
      <button v-if="myClub" @click="router.push(`/game/${myClub._id}`)"><span v-html="icon('ball')"></span>Ground</button>
      <button @click="router.push(myClub ? `/game/${myClub._id}?open=league` : '/u/competitions')"><span v-html="icon('trophy')"></span>League</button>
      <button v-if="myClub" @click="showInbox = true"><span v-html="icon('mail')"></span>Challenges<i v-if="openPlay.incoming.length" class="dot count">{{ openPlay.incoming.length }}</i></button>
      <button @click="router.push(myClub ? `/game/${myClub._id}?open=office` : '/u')"><span v-html="icon('news')"></span>Office</button>
    </nav>

    <side-sheet v-model="showInbox" :width="400">
      <v-theme-provider theme="cozy" with-background>
        <div class="pa-3 text-subtitle-1 font-weight-bold">Challenges</div>
        <div class="px-3"><challenge-inbox /></div>
      </v-theme-provider>
    </side-sheet>
    <challenge-dialog v-model="showChallenge" :preselect-club-id="selected?.kind === 'club' ? selected.id : null" @sent="say('Challenge sent')" />

    <div class="toasts"><div v-if="toast" class="toast" :class="toast.tone">{{ toast.text }}</div></div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { AtlasSearchResult, EditionListItem, TownInvite } from '@repo/api-contract';
import WorldTilesMap, { type AtlasPick, type AtlasVenue } from '@/components/atlas/world-tiles-map.vue';
import CozyPresence from '@/components/cozy/cozy-presence.vue';
import SideSheet from '@/components/world/side-sheet.vue';
import StageTimeline from '@/components/open-play/stage-timeline.vue';
import EditionStandings from '@/components/open-play/edition-standings.vue';
import ChallengeInbox from '@/components/open-play/challenge-inbox.vue';
import ChallengeDialog from '@/components/open-play/challenge-dialog.vue';
import { icon } from '@/components/cozy/icons';
import { crestUrl } from '@/helpers/crest';
import { client } from '@/services/api';
import { realtime } from '@/services/realtime';
import { useStore } from '@/store';
import { unwrap, useOpenPlayStore } from '@/store/open-play';
import { useWorldTilesStore } from '@/store/world-tiles';
import { formatSummary, levelForXp, money, useClubDirectory } from '@/helpers/open-play';
import '@/components/cozy/cozy.scss';

const FILTERS = [
  { key: 'all', label: 'Everything' },
  { key: 'mine', label: 'My competitions' },
  { key: 'rivals', label: 'Rivals' },
  { key: 'open', label: 'Open for entry' },
] as const;
type Filter = (typeof FILTERS)[number]['key'];

const router = useRouter();
const main = useStore();
main.getUser();
const openPlay = useOpenPlayStore();
const dir = useClubDirectory();
const tiles = useWorldTilesStore();

const editions = ref<EditionListItem[]>([]);
const mapRef = ref<InstanceType<typeof WorldTilesMap> | null>(null);
const selected = ref<AtlasPick | null>(null);
const filter = ref<Filter>('all');
const showInbox = ref(false);
const showChallenge = ref(false);
const entering = ref(false);
const toast = ref<{ text: string; tone: 'good' | 'bad' } | null>(null);
const pending = ref<{ x: number; y: number } | null>(null);

// --- Search -----------------------------------------------------------------

const query = ref('');
const results = ref<AtlasSearchResult[]>([]);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
function onSearchInput() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void tiles.search(query.value), 220);
}
function goResult(r: AtlasSearchResult) {
  results.value = [];
  query.value = r.name;
  tiles.focusResult(r);
  selected.value = { kind: r.kind, id: r.id };
}
function jumpHome() {
  const home = tiles.goToMyClub();
  if (!home) return;
  selected.value = { kind: 'club', id: home.clubId };
  setTimeout(() => mapRef.value?.focusPoint(home.x, home.y, 120), 30);
}

// --- What is selected -------------------------------------------------------

const myClub = computed(() => {
  const id = openPlay.clubId;
  const lite = id ? dir.get(id) : undefined;
  return lite ? { ...lite, _id: String(lite._id) } : null;
});
const rivalIds = computed(() => {
  const ids = new Set<string>();
  for (const c of openPlay.challenges) for (const id of [c.homeClubId, c.awayClubId]) if (id && id !== openPlay.clubId) ids.add(id);
  return ids;
});
const entryFor = (editionId: string) => openPlay.entries.find((e) => e.seasonId === editionId && e.status !== 'withdrawn');

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
const formOf = (id: string) => (dir.get(id)?.Form?.recent ?? []).slice(0, 5) as string[];

const selectedClub = computed(() => {
  if (selected.value?.kind !== 'club') return null;
  const c = tiles.clubById(selected.value.id);
  if (!c) return null;
  const lite = dir.get(c.id);
  const country = tiles.nationNear(c.x, c.y);
  return {
    id: c.id,
    name: c.name,
    code: c.code,
    human: c.human,
    prominence: c.prominence,
    kindLine: [country?.name, country ? 'the world' : null].filter(Boolean).join(' · ') || 'Somewhere in the world',
    level: lite?.XP != null ? levelForXp(lite.XP, openPlay.settings?.levelThresholds) : Math.round(c.prominence / 5),
    power: lite?.Rating != null ? Math.round(lite.Rating * 2.5) : Math.round(c.prominence),
    elo: lite?.Elo != null ? Math.round(lite.Elo) : Math.round(1200 + c.prominence * 9),
    fans: fmt(lite?.Fans ?? Math.round(c.prominence * 500)),
  };
});

const focusCountryId = computed(() => {
  if (selected.value?.kind === 'country') return selected.value.id;
  return null;
});

const selectedCountry = computed(() =>
  selected.value?.kind === 'country' ? (tiles.countries.find((c) => c.id === selected.value!.id) ?? null) : null
);

const selectedPlace = computed(() => {
  const k = selected.value?.kind;
  if (k !== 'region' && k !== 'city' && k !== 'district') return null;
  const p = tiles.placeById(selected.value!.id);
  if (!p) return null;
  const country = tiles.nationNear(p.x, p.y);
  const reach = p.type === 'region' ? 46 : p.type === 'city' ? 32 : 18;
  const near = tiles.clubs.filter((c) => Math.hypot(c.x - p.x, c.y - p.y) <= reach + 6).slice(0, 12);
  return { id: p.id, name: p.name, kind: p.type, clubs: p.clubs, countryName: country?.name ?? null, near };
});

const selectedVenue = computed(() => (selected.value?.kind === 'venue' ? (editions.value.find((e) => e.id === selected.value!.id) ?? null) : null));

const isMyPlace = (id: string) => tiles.myHome?.districtId === id || tiles.myHome?.cityId === id;
const clubsInCountry = (id: string) =>
  tiles.countries.some((c) => c.id === id) ? tiles.clubs.filter((c) => tiles.nationNear(c.x, c.y)?.id === id).length : 0;
const placesInCountry = (id: string) => tiles.places.filter((p) => tiles.nationNear(p.x, p.y)?.id === id).length;
const countryList = computed(() => [...tiles.countries].sort((a, b) => a.name.localeCompare(b.name)));

function onSelect(p: AtlasPick | null) {
  selected.value = p;
  if (!p) return;
  if (p.kind === 'country') {
    mapRef.value?.focusCountry(p.id);
  } else if (p.kind === 'venue') {
    const v = venueById(p.id);
    if (v) mapRef.value?.focusPoint(v.x, v.y, 420);
  } else {
    const at = p.kind === 'club' ? tiles.clubById(p.id) : tiles.placeById(p.id);
    if (at) mapRef.value?.focusPoint(at.x, at.y, p.kind === 'club' ? 160 : 320);
  }
  if (isMyPlace(p.id)) void loadInvites();
}

// --- Competitions as venues -------------------------------------------------

type Format = 'league' | 'cup' | 'groups' | 'event';
const FORMAT: Record<Format, { icon: string; tint: string }> = {
  league: { icon: '🏆', tint: '#3a8ee0' },
  cup: { icon: '🏅', tint: '#f08a1c' },
  groups: { icon: '🔷', tint: '#2fb3a6' },
  event: { icon: '🏁', tint: '#6a3fb5' },
};
const stagesOf = (e: EditionListItem) => ((e.definition as { Stages?: { type: string }[] } | null)?.Stages ?? []).map((s) => s.type);
function formatOf(e: EditionListItem): Format {
  const types = stagesOf(e);
  if (types.length === 1 && (types[0] === 'league' || types[0] === 'pyramid')) return 'league';
  if (types.length && types.every((t) => t === 'knockout')) return 'cup';
  if (types.includes('groups')) return 'groups';
  return 'event';
}
function venueStatus(e: EditionListItem) {
  const today = openPlay.settings?.currentDay ?? 0;
  if (e.status === 'registration') return `Open for entry · ${Math.max(0, (e.registrationClosesDay ?? today) - today)} days left`;
  const s = stagesOf(e)[e.currentStage];
  return s === 'knockout' ? 'Knockout' : s === 'groups' ? 'Groups' : s === 'pyramid' ? 'Season running' : 'League running';
}
const countryOfEdition = (e: EditionListItem) => {
  const ids = (e.definition as { Entry?: { countryIds?: string[] } } | null)?.Entry?.countryIds;
  return ids?.length === 1 ? ids[0]! : null;
};

/** National editions sit off their country's coast (from the chrome); the rest
 * are scattered in open sea. */
const venueSpots = computed(() => {
  const spots = new Map<string, { x: number; y: number }>();
  const taken: { x: number; y: number }[] = [];
  const free = (p: { x: number; y: number }, gap: number) => taken.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= gap);
  const byCountry = new Map<string, EditionListItem[]>();
  const global: EditionListItem[] = [];
  for (const e of editions.value) {
    const c = countryOfEdition(e);
    if (c && tiles.countries.some((x) => x.id === c)) byCountry.set(c, [...(byCountry.get(c) ?? []), e]);
    else global.push(e);
  }
  for (const [countryId, list] of byCountry) {
    const c = tiles.countries.find((x) => x.id === countryId)!;
    const reach = 300;
    list.forEach((e, i) => {
      const angle = Math.PI * 0.25 + i * 0.55;
      const spot = { x: c.x + Math.cos(angle) * (reach + 30), y: c.y + Math.sin(angle) * (reach + 30) };
      spots.set(e.id, spot);
      taken.push(spot);
    });
  }
  const size = tiles.worldSize;
  const sea: { x: number; y: number }[] = [];
  for (let y = 120; y < size.height - 80; y += 80) for (let x = 120; x < size.width - 80; x += 80) sea.push({ x, y });
  const clear = sea
    .filter((p) => tiles.countries.every((c) => Math.hypot(c.x - p.x, c.y - p.y) > 170) && tiles.places.every((t) => Math.hypot(t.x - p.x, t.y - p.y) > 90))
    .sort((p, q) => Math.hypot(p.x - size.width / 2, p.y - size.height / 2) - Math.hypot(q.x - size.width / 2, q.y - size.height / 2));
  for (const e of global) {
    const spot = clear.find((p) => free(p, 120));
    if (!spot) continue;
    spots.set(e.id, spot);
    taken.push(spot);
  }
  return spots;
});

const venues = computed<AtlasVenue[]>(() =>
  editions.value
    .filter((e) => (filter.value === 'open' ? e.status === 'registration' : filter.value === 'mine' ? !!entryFor(e.id) : true))
    .flatMap((e) => {
      const at = venueSpots.value.get(e.id);
      if (!at) return [];
      const f = FORMAT[formatOf(e)];
      return [{ id: e.id, ...at, label: e.competitionName ?? e.title, icon: f.icon, tint: f.tint, status: venueStatus(e) }];
    })
);
const venueById = (id: string) => venues.value.find((v) => v.id === id) ?? null;
const openVenues = computed(() => venues.value.filter((v) => editions.value.find((e) => e.id === v.id)?.status === 'registration'));
const nationalVenues = (countryId: string) => venues.value.filter((v) => countryOfEdition(editions.value.find((e) => e.id === v.id)!) === countryId);

const canChallengeAnyone = computed(() =>
  openPlay.activeEntries.some(
    (e) => e.edition.status === 'running' && e.status === 'active' && !['knockout', 'pyramid'].includes(stagesOf(e.edition as never)[e.edition.currentStage] ?? '')
  )
);

// --- Founding and invites ---------------------------------------------------

const invites = ref<TownInvite[]>([]);
const inviting = ref(false);
const inviteUrl = (token: string) => `${window.location.origin}/start?invite=${encodeURIComponent(token)}`;

async function loadInvites() {
  const clubId = tiles.myHome?.clubId ?? openPlay.clubId;
  if (!clubId) return;
  try {
    invites.value = unwrap<TownInvite[]>(await client.atlas.listInvites.query({ query: { clubId } }));
  } catch {
    invites.value = [];
  }
}
async function makeInvite() {
  const clubId = tiles.myHome?.clubId ?? openPlay.clubId;
  if (!clubId) return;
  inviting.value = true;
  try {
    const inv = unwrap<TownInvite>(await client.atlas.createInvite.mutation({ body: { clubId } }));
    invites.value = [inv, ...invites.value];
    await copyInvite(inv.token);
  } catch (err) {
    say(err instanceof Error ? err.message : String(err), 'bad');
  } finally {
    inviting.value = false;
  }
}
async function copyInvite(token: string) {
  try {
    await navigator.clipboard.writeText(inviteUrl(token));
    say('Invite link copied');
  } catch {
    say('Select the link to copy it');
  }
}

// --- Data -------------------------------------------------------------------

function say(text: string, tone: 'good' | 'bad' = 'good') {
  toast.value = { text, tone };
  setTimeout(() => toast.value?.text === text && (toast.value = null), 3200);
}

async function loadEditions() {
  const eligibleFor = openPlay.clubId ?? undefined;
  const [open, running] = await Promise.all([
    client.editions.list.query({ query: { status: 'registration', eligibleFor } }),
    client.editions.list.query({ query: { status: 'running' } }),
  ]);
  editions.value = [...unwrap<EditionListItem[]>(open), ...unwrap<EditionListItem[]>(running)];
}
async function enter(id: string) {
  entering.value = true;
  try {
    await openPlay.register(id);
    say('Entered! Good luck.');
    await loadEditions();
  } catch (err) {
    const e = err as Error & { reasons?: string[] };
    say([e.message, ...(e.reasons ?? [])].join(' · '), 'bad');
  } finally {
    entering.value = false;
  }
}

// The world grows live: someone else founding a club, maybe opening a place
// with it. Batched, so a busy world refetches the visible cells at most every
// few seconds (docs/perfect/WORLD-HIERARCHY-SPEC.md §7.5).
let reloadTimer: ReturnType<typeof setTimeout> | undefined;
function onWorldFounded() {
  if (reloadTimer) return;
  reloadTimer = setTimeout(() => {
    reloadTimer = undefined;
    tiles.invalidate();
  }, 3000);
}

// Keep the selection clear of the panel (right on wide screens, bottom on phones).
const viewport = reactive({ w: window.innerWidth, h: window.innerHeight });
const onResize = () => Object.assign(viewport, { w: window.innerWidth, h: window.innerHeight });
const insets = computed(() => (viewport.w <= 760 ? { top: 80, bottom: Math.round(viewport.h * 0.45) } : { top: 80, right: 470, bottom: 90 }));

onMounted(() => {
  try {
    localStorage.setItem('fspro_seen_world', '1');
  } catch {
    // Only the campus checklist uses it.
  }
  tiles.reset();
  void tiles.loadChrome();
  openPlay.start();
  realtime.on('world:founded', onWorldFounded);
  window.addEventListener('resize', onResize);
});
watch(
  () => openPlay.clubId,
  () => void loadEditions().catch((err) => say(err instanceof Error ? err.message : String(err), 'bad')),
  { immediate: true }
);
watch(() => openPlay.editionsVersion, () => void loadEditions().catch(() => undefined));
onBeforeUnmount(() => {
  openPlay.stop();
  realtime.off('world:founded', onWorldFounded);
  window.removeEventListener('resize', onResize);
  clearTimeout(reloadTimer);
  clearTimeout(searchTimer);
});
</script>

<style scoped>
.world {
  background: #5aaedb;
}
.world-head {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 480px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  flex-wrap: wrap;
  pointer-events: none;
}
.world-head > * {
  pointer-events: auto;
}
.home {
  width: 60px;
  height: 60px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  background: linear-gradient(#7cc7f5, #4aa3e6);
  border: 4px solid #f3d27a;
  box-shadow: var(--shadow);
}
.world-title {
  padding: 8px 16px;
  border-radius: 16px;
  background: var(--cream);
  border: 3px solid #c9a46a;
  box-shadow: var(--shadow);
}
.world-title b {
  display: block;
  font-size: 22px;
  line-height: 1.1;
}
.world-title small {
  color: var(--muted);
  font-size: 13px;
}
.world-search {
  position: relative;
}
.world-search input {
  width: 220px;
  padding: 8px 14px;
  border-radius: 14px;
  border: 3px solid #c9a46a;
  background: var(--cream);
  font-weight: 600;
  box-shadow: var(--shadow);
}
.world-search .results {
  position: absolute;
  top: 46px;
  left: 0;
  width: 280px;
  margin: 0;
  padding: 6px;
  list-style: none;
  border-radius: 14px;
  background: var(--cream);
  border: 3px solid #c9a46a;
  box-shadow: var(--shadow);
  z-index: 4;
}
.world-search .results button {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 10px;
  text-align: left;
}
.world-search .results button:hover {
  background: #fff3d8;
}
.world-search .results small {
  color: var(--muted);
  text-transform: capitalize;
}
.mine-jump {
  align-self: center;
}
.filters {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.filters button {
  padding: 5px 12px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 14px;
  background: rgba(255, 250, 240, 0.9);
  border: 2px solid #e2cc9c;
  color: var(--wood-d);
}
.filters button.on {
  background: var(--green);
  border-color: var(--green-d);
  color: #fff;
}
.world-error {
  position: absolute;
  bottom: 100px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 14px;
  border-radius: 12px;
  background: #fdecea;
  color: #9a2216;
  border: 2px solid #e5402f;
  z-index: 3;
}
.world-panel {
  position: absolute;
  top: 12px;
  right: 12px;
  bottom: 96px;
  width: min(440px, calc(100vw - 24px));
  overflow: auto;
  padding: 16px 18px;
  border-radius: 20px;
  background: var(--cream);
  border: 4px solid #c9a46a;
  box-shadow: var(--shadow);
  user-select: text;
}
.world-panel h2 {
  margin: 0 0 2px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 24px;
}
.world-panel h2 :deep(.ic) {
  width: 30px;
  height: 30px;
}
.world-panel h4 {
  margin: 12px 0 4px;
}
.card-head {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 4px;
}
.card-head h2 {
  font-size: 22px;
}
.card-head .sub {
  margin: 0 0 4px;
}
.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-right: 6px;
  padding: 1px 10px 1px 6px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
  background: #fff;
  border: 2px solid #eadbb8;
  color: var(--muted);
}
.tag.human {
  border-color: var(--gold);
  color: var(--wood-d);
}
.tag.mine {
  border-color: var(--green);
  color: var(--green-d);
}
.tag :deep(.ic) {
  width: 16px;
  height: 16px;
}
.form-line {
  margin: 4px 0;
  font-weight: 600;
  font-size: 14px;
}
.form-line i {
  display: inline-block;
  width: 20px;
  margin-left: 3px;
  text-align: center;
  border-radius: 5px;
  color: #fff;
  font-style: normal;
  font-size: 12px;
}
.list {
  list-style: none;
  margin: 6px 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 12px;
  background: #fffaf0;
  border: 2px solid #eadbb8;
  text-align: left;
}
.item:hover {
  border-color: var(--green);
}
.item .grow {
  flex: 1;
  min-width: 0;
}
.item b {
  display: block;
  font-size: 15px;
}
.item small {
  color: var(--muted);
  font-size: 12px;
}
.invite-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 0;
}
.invite-row input {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  border-radius: 10px;
  border: 2px solid #eadbb8;
  background: #fffaf0;
  font-size: 12px;
}
.invite-row small {
  color: var(--muted);
  white-space: nowrap;
}
.empty {
  padding: 10px;
  text-align: center;
  color: var(--muted);
}
.venue-ic {
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: inline-grid;
  place-items: center;
  font-size: 16px;
  border: 2px solid #fff;
  box-shadow: 0 2px 0 rgba(70, 40, 15, 0.25);
}
.venue-body {
  border-radius: 12px;
  padding: 8px;
  margin: 8px 0;
}
.note {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--muted);
}
.dock {
  z-index: 5;
}
.dock .dot.count {
  display: grid;
  top: 2px;
  right: 18px;
}
.dock button {
  position: relative;
}
.toasts {
  top: 90px;
}
:deep(.presence) {
  bottom: 100px;
}
@media (max-width: 760px) {
  .world-head {
    right: 8px;
    top: 8px;
    left: 8px;
  }
  .world-title small,
  .filters,
  .world-search input {
    display: none;
  }
  .world-panel {
    top: auto;
    left: 8px;
    right: 8px;
    bottom: 84px;
    width: auto;
    max-height: 42vh;
  }
  :deep(.presence) {
    display: none;
  }
}
</style>
