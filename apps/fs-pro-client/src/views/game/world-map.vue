<template>
  <div class="cozy world">
    <atlas-map
      v-if="atlas"
      ref="mapRef"
      :atlas="visibleAtlas"
      :selected="selected"
      :venues="venues"
      :my-club-ids="myClubIds"
      :highlight-club-ids="rivalIds"
      :insets="insets"
      @select="onSelect"
    />
    <div v-else class="world-loading">{{ loadError || 'Unrolling the map…' }}</div>

    <!-- Top left: back home, and the world in numbers -->
    <header class="world-head">
      <button v-if="myClub" class="home" :title="`Back to ${myClub.name}`" @click="router.push(`/game/${myClub.id}`)">
        <img :src="crestUrl(myClub.code)" :alt="myClub.name" width="44" height="48" />
      </button>
      <div class="world-title">
        <b>The World</b>
        <small v-if="atlas">
          {{ atlas.countries.length }} countries · {{ atlas.regions.length }} regions · {{ atlas.towns.length }} towns · {{ clubCount }} clubs<template v-if="atlas.clubsLoaded === 'all'"> · {{ humanCount }} managed</template>
        </small>
      </div>
      <nav class="filters" aria-label="Show">
        <button v-for="f in FILTERS" :key="f.key" :class="{ on: filter === f.key }" @click="filter = f.key">{{ f.label }}</button>
      </nav>
    </header>

    <!-- Right: whatever is selected, or the world overview -->
    <aside class="world-panel">
      <!-- A club -->
      <template v-if="selectedClub">
        <div class="card-head">
          <img :src="crestUrl(selectedClub.club.code)" :alt="selectedClub.club.name" width="64" height="70" />
          <div>
            <h2>{{ selectedClub.club.name }}</h2>
            <p class="sub">{{ selectedClub.town.name }}, {{ selectedClub.country?.name }}</p>
            <span v-if="selectedClub.club.human" class="tag human"><span v-html="icon('people')"></span>{{ selectedClub.club.ownerName }}</span>
            <span v-else class="tag">AI club</span>
            <span v-if="myClubIds.has(selectedClub.club.id)" class="tag mine">Yours</span>
          </div>
        </div>
        <div class="stats-row">
          <div><small>Level</small><b>{{ levelOf(selectedClub.club.xp) }}</b></div>
          <div><small>Power</small><b>{{ Math.round(selectedClub.club.rating * 2.5) }}</b></div>
          <div><small>Elo</small><b>{{ selectedClub.club.elo }}</b></div>
          <div><small>Fans</small><b>{{ fmt(selectedClub.club.fans) }}</b></div>
        </div>
        <p v-if="formOf(selectedClub.club.id).length" class="form-line">
          Form <i v-for="(r, i) in formOf(selectedClub.club.id)" :key="i" :class="`res-${r.toLowerCase()}`">{{ r }}</i>
        </p>
        <div class="row-btns">
          <button class="btn" @click="router.push(`/game/${selectedClub.club.id}`)">Visit ground</button>
          <button
            v-if="myClub && !myClubIds.has(selectedClub.club.id)"
            class="btn primary"
            :disabled="!canChallengeAnyone"
            :title="canChallengeAnyone ? '' : 'Enter a league to send challenges'"
            @click="showChallenge = true"
          >
            Challenge
          </button>
        </div>
        <p v-if="myClub && !canChallengeAnyone && !myClubIds.has(selectedClub.club.id)" class="note">
          Challenges are for league games: enter a league (the trophy markers on the map) first. PLAY at your ground matches you any time.
        </p>
      </template>

      <!-- A town -->
      <template v-else-if="selectedTown">
        <h2><span class="tdot" :class="selectedTown.terrain" aria-hidden="true"></span>{{ selectedTown.name }}</h2>
        <p class="sub">
          {{ TERRAIN_LABEL[selectedTown.terrain] }} town in {{ [regionById(selectedTown.regionId)?.name, countryById(selectedTown.countryId)?.name].filter(Boolean).join(', ') }}
          <template v-if="selectedTown.founder"> · founded by {{ selectedTown.founder.name }}</template>
          · {{ selectedTown.clubCount }}/{{ TOWN_MAX_CLUBS }} clubs
        </p>
        <ul class="list">
          <li v-for="c in selectedTown.clubs" :key="c.id">
            <button class="item" @click="onSelect({ kind: 'club', id: c.id })">
              <img :src="crestUrl(c.code)" :alt="c.name" width="30" height="33" />
              <span class="grow"><b>{{ c.name }}</b><small>Level {{ levelOf(c.xp) }} · Power {{ Math.round(c.rating * 2.5) }}{{ c.human ? ` · ${c.ownerName}` : '' }}</small></span>
            </button>
          </li>
          <li v-if="!selectedTown.clubs.length" class="empty">{{ selectedTown.clubCount ? 'Loading clubs…' : 'No clubs yet.' }}</li>
        </ul>
        <!-- Friends join your town through an invite link (docs/WORLD-PYRAMID-SPEC.md, "Invites"). -->
        <template v-if="myTownClubId === null || myTownId !== selectedTown.id">
          <p class="note">New clubs are placed where the world has room. Friends of a club here can be invited in.</p>
        </template>
        <template v-else>
          <h4>Invite friends to {{ selectedTown.name }}</h4>
          <p class="sub">
            Anyone who signs up with your link starts their club here (or next door, if {{ selectedTown.name }} is full).
          </p>
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
          <div><small>Regions</small><b>{{ regionsOf(selectedCountry.id).length }}</b></div>
          <div><small>Towns</small><b>{{ townsOf(selectedCountry.id).length }}</b></div>
          <div><small>Clubs</small><b>{{ clubTotal(selectedCountry.id) }}</b></div>
          <div v-if="clubsLoadedFor(selectedCountry.id)"><small>Managed</small><b>{{ clubsIn(selectedCountry.id).filter((c) => c.human).length }}</b></div>
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
        <h4>Towns</h4>
        <ul class="list">
          <li v-for="t in townsOf(selectedCountry.id)" :key="t.id">
            <button class="item" @click="onSelect({ kind: 'town', id: t.id })">
              <span class="tdot" :class="t.terrain" aria-hidden="true"></span>
              <span class="grow"><b>{{ t.name }}</b><small>{{ regionById(t.regionId)?.name ?? '' }} · {{ t.clubCount }}/{{ TOWN_MAX_CLUBS }} clubs</small></span>
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
      <template v-else-if="atlas">
        <h2><span v-html="icon('map')"></span>The world</h2>
        <p class="sub">Tap a country, town, club or trophy. The world fills town by town: when a country is full, the next club founds a new one.</p>
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
              <span class="grow"><b>{{ c.name }}</b><small>{{ c.towns }} towns · {{ c.clubs }} clubs{{ c.founder ? ` · ${c.founder.name}` : '' }}</small></span>
            </button>
          </li>
        </ul>
        <div class="row-btns sticky">
          <button v-if="canFoundClub" class="btn primary" @click="router.push('/start')">Found {{ myClubIds.size ? 'another' : 'a' }} club</button>
        </div>
      </template>
    </aside>

    <cozy-presence />

    <nav class="dock" aria-label="Go to">
      <button v-if="myClub" @click="router.push(`/game/${myClub.id}`)"><span v-html="icon('ball')"></span>Ground</button>
      <button @click="router.push(myClub ? `/game/${myClub.id}?open=league` : '/u/competitions')"><span v-html="icon('trophy')"></span>League</button>
      <button v-if="myClub" @click="showInbox = true"><span v-html="icon('mail')"></span>Challenges<i v-if="openPlay.incoming.length" class="dot count">{{ openPlay.incoming.length }}</i></button>
      <button @click="router.push(myClub ? `/game/${myClub.id}?open=office` : '/u')"><span v-html="icon('news')"></span>Office</button>
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
import { TOWN_MAX_CLUBS, type Atlas, type AtlasClub, type EditionListItem, type TownInvite } from '@repo/api-contract';
import AtlasMap, { type AtlasPick, type AtlasVenue } from '@/components/atlas/atlas-map.vue';
import { TERRAIN_LABEL } from '@/components/atlas/terrains';
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
import { formatSummary, money, useClubDirectory } from '@/helpers/open-play';
import '@/components/cozy/cozy.scss';

const FILTERS = [
  { key: 'all', label: 'Everything' },
  { key: 'mine', label: 'My competitions' },
  { key: 'rivals', label: 'Rivals' },
  { key: 'open', label: 'Open for entry' },
] as const;
type Filter = (typeof FILTERS)[number]['key'];

const router = useRouter();
const store = useStore();
store.getUser();
const openPlay = useOpenPlayStore();
const dir = useClubDirectory();

const atlas = ref<Atlas | null>(null);
const loadError = ref('');
const editions = ref<EditionListItem[]>([]);
const mapRef = ref<InstanceType<typeof AtlasMap> | null>(null);
const selected = ref<AtlasPick | null>(null);
const filter = ref<Filter>('all');
const showInbox = ref(false);
const showChallenge = ref(false);
const entering = ref(false);
const toast = ref<{ text: string; tone: 'good' | 'bad' } | null>(null);

// --- What's on the map ---------------------------------------------------------------

// In a big world the atlas carries club lists for one country at a time
// (the one you look at, your own by default); counts are always there.
const allClubs = computed(() => (atlas.value ? atlas.value.towns.flatMap((t) => t.clubs.map((club) => ({ club, town: t }))) : []));
const clubCount = computed(() => (atlas.value?.towns ?? []).reduce((n, t) => n + t.clubCount, 0));
const humanCount = computed(() => allClubs.value.filter((c) => c.club.human).length);
const myClubIds = computed(() => new Set(atlas.value?.me?.clubIds ?? []));
const myClub = computed(() => {
  const id = openPlay.clubId ?? atlas.value?.me?.clubIds[0];
  return allClubs.value.find((c) => c.club.id === id)?.club ?? null;
});
const rivalIds = computed(() => {
  const ids = new Set<string>();
  for (const c of openPlay.challenges) for (const id of [c.homeClubId, c.awayClubId]) if (id && id !== openPlay.clubId) ids.add(id);
  return ids;
});

const entryFor = (editionId: string) => openPlay.entries.find((e) => e.seasonId === editionId && e.status !== 'withdrawn');

/** The filter hides clubs and venues; the land always stays. */
const visibleAtlas = computed<Atlas>(() => {
  const a = atlas.value!;
  if (filter.value === 'all' || filter.value === 'open') return a;
  const keep = (c: AtlasClub) => myClubIds.value.has(c.id) || (filter.value === 'rivals' && rivalIds.value.has(c.id));
  return { ...a, towns: a.towns.map((t) => ({ ...t, clubs: t.clubs.filter(keep) })) };
});

const countryById = (id: string) => atlas.value?.countries.find((c) => c.id === id);
const regionById = (id: string | null) => (id ? atlas.value?.regions.find((r) => r.id === id) : undefined);
const regionsOf = (countryId: string) => (atlas.value?.regions ?? []).filter((r) => r.countryId === countryId);
const townsOf = (countryId: string) => (atlas.value?.towns ?? []).filter((t) => t.countryId === countryId).sort((a, b) => b.clubCount - a.clubCount || a.name.localeCompare(b.name));
const clubsIn = (countryId: string) => townsOf(countryId).flatMap((t) => t.clubs);
const clubTotal = (countryId: string) => townsOf(countryId).reduce((n, t) => n + t.clubCount, 0);
const clubsLoadedFor = (countryId: string) => {
  const loaded = atlas.value?.clubsLoaded;
  return loaded === 'all' || (!!loaded && loaded.countryId === countryId);
};
const countryList = computed(() =>
  (atlas.value?.countries ?? [])
    .map((c) => ({ ...c, towns: townsOf(c.id).length, clubs: clubTotal(c.id) }))
    .sort((a, b) => b.clubs - a.clubs || a.name.localeCompare(b.name))
);

function levelOf(xp: number) {
  const t = openPlay.settings?.levelThresholds;
  let l = 0;
  while ((t && l + 1 < t.length ? t[l + 1]! : 100 * (l + 1) ** 2) <= xp) l++;
  return l;
}
const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
const formOf = (id: string) => (dir.get(id)?.Form?.recent ?? []).slice(0, 5) as string[];

// --- Competitions as venues ---------------------------------------------------------------

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

/** National editions sit off their country's coast; the rest in open sea. */
const venueSpots = computed(() => {
  const spots = new Map<string, { x: number; y: number }>();
  const a = atlas.value;
  if (!a) return spots;
  const taken: { x: number; y: number }[] = [];
  const free = (p: { x: number; y: number }, gap: number) => taken.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= gap);
  const byCountry = new Map<string, EditionListItem[]>();
  const global: EditionListItem[] = [];
  for (const e of editions.value) {
    const c = countryOfEdition(e);
    if (c && countryById(c)) byCountry.set(c, [...(byCountry.get(c) ?? []), e]);
    else global.push(e);
  }
  for (const [countryId, list] of byCountry) {
    const c = countryById(countryId)!;
    const reach = Math.max(70, ...townsOf(countryId).map((t) => Math.hypot(t.x - c.x, t.y - c.y) + 40));
    list.forEach((e, i) => {
      const angle = Math.PI * 0.25 + i * 0.55;
      const spot = { x: c.x + Math.cos(angle) * (reach + 30), y: c.y + Math.sin(angle) * (reach + 30) };
      spots.set(e.id, spot);
      taken.push(spot);
    });
  }
  const sea: { x: number; y: number }[] = [];
  for (let y = 120; y < a.height - 80; y += 60) for (let x = 120; x < a.width - 80; x += 60) sea.push({ x, y });
  const clear = sea
    .filter((p) => a.countries.every((c) => Math.hypot(c.x - p.x, c.y - p.y) > 150) && a.towns.every((t) => Math.hypot(t.x - p.x, t.y - p.y) > 90))
    .sort((p, q) => Math.hypot(p.x - a.width / 2, p.y - a.height / 2) - Math.hypot(q.x - a.width / 2, q.y - a.height / 2));
  for (const e of global) {
    const spot = clear.find((p) => free(p, 110));
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

// --- Selection --------------------------------------------------------------------------

const selectedClub = computed(() => {
  if (selected.value?.kind !== 'club') return null;
  const hit = allClubs.value.find((c) => c.club.id === selected.value!.id);
  return hit ? { ...hit, country: countryById(hit.town.countryId) } : null;
});
const selectedTown = computed(() => (selected.value?.kind === 'town' ? (atlas.value?.towns.find((t) => t.id === selected.value!.id) ?? null) : null));
const selectedCountry = computed(() => (selected.value?.kind === 'country' ? (countryById(selected.value.id) ?? null) : null));
const selectedVenue = computed(() => (selected.value?.kind === 'venue' ? (editions.value.find((e) => e.id === selected.value!.id) ?? null) : null));
function onSelect(p: AtlasPick | null) {
  selected.value = p;
  if (!p) return;
  if (p.kind === 'country') {
    mapRef.value?.focusCountry(p.id);
    if (!clubsLoadedFor(p.id)) void loadAtlas(p.id);
  } else if (p.kind === 'town') {
    const t = atlas.value?.towns.find((x) => x.id === p.id);
    if (t) mapRef.value?.focusPoint(t.x, t.y, 260);
    if (t && !clubsLoadedFor(t.countryId)) void loadAtlas(t.countryId);
    if (t && t.id === myTownId.value) void loadInvites();
  } else if (p.kind === 'club') {
    const c = allClubs.value.find((x) => x.club.id === p.id);
    if (c) mapRef.value?.focusPoint(c.town.x, c.town.y, 220);
  } else if (p.kind === 'venue') {
    const v = venueById(p.id);
    if (v) mapRef.value?.focusPoint(v.x, v.y, 420);
  }
}

// --- Founding and invites ---------------------------------------------------------------------

const canFoundClub = computed(() => {
  const me = atlas.value?.me;
  return !!me && me.founded.clubs < me.limits.clubs;
});

/** The town of the user's club, once its country's clubs are loaded. */
const myTown = computed(() => allClubs.value.find((c) => myClubIds.value.has(c.club.id)) ?? null);
const myTownId = computed(() => myTown.value?.town.id ?? null);
const myTownClubId = computed(() => myTown.value?.club.id ?? null);
const invites = ref<TownInvite[]>([]);
const inviting = ref(false);
const inviteUrl = (token: string) => `${window.location.origin}/start?invite=${encodeURIComponent(token)}`;

async function loadInvites() {
  if (!myTownClubId.value) return;
  try {
    invites.value = unwrap<TownInvite[]>(await client.atlas.listInvites.query({ query: { clubId: myTownClubId.value } }));
  } catch {
    invites.value = [];
  }
}
async function makeInvite() {
  if (!myTownClubId.value) return;
  inviting.value = true;
  try {
    const inv = unwrap<TownInvite>(await client.atlas.createInvite.mutation({ body: { clubId: myTownClubId.value } }));
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

// --- Data ------------------------------------------------------------------------------

function say(text: string, tone: 'good' | 'bad' = 'good') {
  toast.value = { text, tone };
  setTimeout(() => toast.value?.text === text && (toast.value = null), 3200);
}

/** The atlas, with club lists for `countryId` (else the server's default:
 * every club in a small world, the user's own country in a big one). */
async function loadAtlas(countryId?: string) {
  try {
    const loaded = atlas.value?.clubsLoaded;
    const keep = countryId ?? (loaded && loaded !== 'all' ? loaded.countryId : undefined);
    atlas.value = unwrap<Atlas>(await client.atlas.getAtlas.query({ query: { countryId: keep } }));
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err);
  }
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

// The world grows live: someone else founding a club, maybe opening a town,
// region or country with it. Batched, so a busy world reloads at most every
// few seconds.
let reloadTimer: ReturnType<typeof setTimeout> | undefined;
function onWorldFounded(p: { kind: string; name: string; opened?: string[] }) {
  if (p.opened?.includes('country')) say(`A new nation is on the map, founded by ${p.name}`);
  if (reloadTimer) return;
  reloadTimer = setTimeout(() => {
    reloadTimer = undefined;
    void loadAtlas();
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
  openPlay.start();
  void loadAtlas();
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
});
</script>

<style scoped>
.world {
  background: #5aaedb;
}
.world-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 22px;
  font-weight: 600;
  color: #fff;
}
.world-head {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 480px;
  display: flex;
  align-items: center;
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
  .filters {
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
