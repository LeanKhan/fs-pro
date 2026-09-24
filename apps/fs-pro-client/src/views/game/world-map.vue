<template>
  <div class="world-map">
    <world-scene
      ref="sceneRef"
      :width="WORLD_W"
      :height="WORLD_H"
      :scene="manifest.has('map/scene.jpg') ? '/world/map/scene.jpg' : null"
      :objects="objects"
      :selected="selectedId"
      surround="#0f2233"
      :margin="0.25"
      :fade-edges="false"
      label="World"
      @select="onSelect"
    >
      <template #under="{ pct }">
        <div
          v-for="p in visiblePlaces"
          :key="p.id"
          class="wm-place"
          :style="{ left: pct(p.x, 'x'), top: pct(p.y, 'y'), width: pct(placeSize(p), 'x'), height: pct(placeSize(p), 'y') }"
        >
          <span>{{ p.name }}</span>
        </div>
      </template>
    </world-scene>

    <club-top-hud
      v-if="myClub"
      :club-name="myClub.Name"
      :club-code="myClub.ClubCode"
      :xp="myClub.XP ?? 0"
      :thresholds="openPlay.settings?.levelThresholds"
      :elo="myClub.Elo ?? 1500"
      :location="placeName(myClub)"
      :budget="myClub.Budget ?? 0"
      :entries-used="openPlay.entriesUsed"
      :max-entries="openPlay.settings?.maxConcurrentEntries"
      :inbox="openPlay.incoming.length"
      @open-inbox="showInbox = true"
      @open-competitions="router.push('/u/competitions')"
      @open-settings="router.push('/u/settings')"
    />

    <!-- Filters -->
    <div class="wm-filters">
      <v-chip-group v-model="filter" mandatory selected-class="text-amber">
        <v-chip value="all" size="small" variant="flat" color="rgba(12,19,34,.88)">Everything</v-chip>
        <v-chip value="mine" size="small" variant="flat" color="rgba(12,19,34,.88)">My competitions</v-chip>
        <v-chip value="rivals" size="small" variant="flat" color="rgba(12,19,34,.88)">Rivals</v-chip>
        <v-chip value="open" size="small" variant="flat" color="rgba(12,19,34,.88)">Open for entry</v-chip>
      </v-chip-group>
    </div>

    <!-- Unplaced clubs tray -->
    <div v-if="layout.unplaced.length && filter !== 'mine' && filter !== 'open'" class="wm-tray">
      <div class="text-caption font-weight-bold mb-1">Unplaced clubs ({{ layout.unplaced.length }})</div>
      <div class="wm-tray-list">
        <button v-for="c in trayClubs" :key="c._id" type="button" class="wm-tray-item" @click="onSelect(`club:${c._id}`)">
          <club-crest :code="c.ClubCode" :name="c.Name" :size="22" />
          <span class="text-truncate">{{ c.Name }}</span>
        </button>
      </div>
    </div>

    <!-- Rival card -->
    <v-card v-if="selectedClub" class="wm-card" elevation="12">
      <v-card-item>
        <template #prepend><club-crest :code="selectedClub.ClubCode" :name="selectedClub.Name" :size="44" /></template>
        <v-card-title>{{ selectedClub.Name }}</v-card-title>
        <v-card-subtitle>{{ placeName(selectedClub) }}</v-card-subtitle>
        <template #append><v-btn icon="mdi-close" size="small" variant="text" @click="selectedId = null" /></template>
      </v-card-item>
      <v-card-text class="d-flex align-center ga-3 flex-wrap">
        <level-badge :xp="selectedClub.XP ?? 0" :thresholds="openPlay.settings?.levelThresholds" :size="28" show-label />
        <span>Elo {{ Math.round(selectedClub.Elo ?? 1500) }}</span>
        <span class="d-flex ga-1">
          <v-chip v-for="(r, i) in selectedClub.Form?.recent ?? []" :key="i" size="x-small" :color="r === 'W' ? 'green' : r === 'D' ? 'grey' : 'red'">{{ r }}</v-chip>
        </span>
      </v-card-text>
      <v-card-actions>
        <v-btn variant="text" :to="`/game/${selectedClub._id}`" prepend-icon="mdi-home-city">Visit campus</v-btn>
        <v-spacer />
        <v-btn
          v-if="selectedClub._id !== openPlay.clubId"
          color="teal"
          variant="flat"
          prepend-icon="mdi-sword-cross"
          :disabled="!canChallengeAnyone"
          @click="showChallenge = true"
        >
          Challenge
        </v-btn>
      </v-card-actions>
      <div v-if="!canChallengeAnyone && selectedClub._id !== openPlay.clubId" class="text-caption text-medium-emphasis px-4 pb-3">
        You need to be playing in a league or group stage to send challenges.
      </div>
    </v-card>

    <!-- Venue sheet -->
    <side-sheet :model-value="!!selectedVenue" :width="520" @update:model-value="(v: boolean) => !v && (selectedId = null)">
      <template v-if="selectedVenue">
        <div class="pa-4">
          <div class="d-flex align-center mb-1">
            <div class="text-h6">{{ selectedVenue.title }}</div>
            <v-spacer />
            <v-btn icon="mdi-close" size="small" variant="text" @click="selectedId = null" />
          </div>
          <div class="text-caption text-medium-emphasis mb-2">{{ formatSummary(selectedVenue.definition as never) }}</div>
          <stage-timeline :definition="selectedVenue.definition" :current-stage="selectedVenue.currentStage" :status="selectedVenue.status" class="mb-3" />
          <div v-if="selectedVenue.status === 'registration'" class="mb-3">
            <div v-for="r in selectedVenue.eligibility?.reasons ?? []" :key="r" class="text-caption text-red-lighten-2"><v-icon size="14">mdi-lock</v-icon> {{ r }}</div>
            <v-btn
              v-if="!entryFor(selectedVenue.id)"
              color="teal"
              variant="flat"
              class="mt-2"
              :disabled="!selectedVenue.eligibility?.eligible"
              :loading="entering"
              @click="enter(selectedVenue.id)"
            >
              Enter{{ selectedVenue.eligibility?.fee ? ` · ${money(selectedVenue.eligibility.fee)}` : '' }}
            </v-btn>
            <v-chip v-else color="teal" class="mt-2">You're entered</v-chip>
          </div>
          <edition-standings
            v-else
            :edition-id="selectedVenue.id"
            :definition="selectedVenue.definition"
            :current-stage="selectedVenue.currentStage"
            :status="selectedVenue.status"
            :highlight-club-id="openPlay.clubId"
            compact
          />
          <v-btn variant="text" class="mt-3" :to="`/u/competitions/${selectedVenue.id}`">Open competition page</v-btn>
        </div>
      </template>
    </side-sheet>

    <side-sheet v-model="showInbox" :width="400">
      <div class="pa-3 text-subtitle-1 font-weight-bold">Challenges</div>
      <div class="px-3"><challenge-inbox /></div>
    </side-sheet>

    <challenge-dialog v-model="showChallenge" :preselect-club-id="selectedClub?._id ?? null" @sent="toast = 'Challenge sent'" />

    <bottom-dock-nav current-tab="world" :show-play="false" @change-tab="onDock" />

    <v-snackbar :model-value="!!toast" timeout="3000" color="teal-darken-2" @update:model-value="toast = ''">{{ toast }}</v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { EditionListItem } from '@repo/api-contract';
import WorldScene from '@/components/world/world-scene.vue';
import SideSheet from '@/components/world/side-sheet.vue';
import { useWorldManifest } from '@/components/world/manifest';
import { WORLD_H, WORLD_W, layoutWorld, ringRadius, type PlaceSpot } from '@/components/world/world-layout';
import type { SceneObject } from '@/components/world/types';
import ClubTopHud from '@/components/hud/club-top-hud.vue';
import BottomDockNav from '@/components/hud/bottom-dock-nav.vue';
import ClubCrest from '@/components/open-play/club-crest.vue';
import LevelBadge from '@/components/open-play/level-badge.vue';
import StageTimeline from '@/components/open-play/stage-timeline.vue';
import EditionStandings from '@/components/open-play/edition-standings.vue';
import ChallengeInbox from '@/components/open-play/challenge-inbox.vue';
import ChallengeDialog from '@/components/open-play/challenge-dialog.vue';
import { client } from '@/services/api';
import { useStore } from '@/store';
import { unwrap, useOpenPlayStore } from '@/store/open-play';
import { formatSummary, money, useClubDirectory, type ClubLite } from '@/helpers/open-play';
import { iconFileByName } from '@/plugins/customIcons';

const router = useRouter();
const store = useStore();
if (!store.isAuthenticated) store.getUser();
const openPlay = useOpenPlayStore();
const dir = useClubDirectory();
const manifest = useWorldManifest();

const sceneRef = ref<InstanceType<typeof WorldScene> | null>(null);
const editions = ref<EditionListItem[]>([]);
const selectedId = ref<string | null>(null);
const filter = ref<'all' | 'mine' | 'rivals' | 'open'>('all');
const showInbox = ref(false);
const showChallenge = ref(false);
const entering = ref(false);
const toast = ref('');

const clubs = computed(() => [...dir.clubs.value.values()]);
const myClub = computed(() => dir.get(openPlay.clubId));
const layout = computed(() => layoutWorld(clubs.value, editions.value.map((e) => e.id)));

const entryFor = (editionId: string) => openPlay.entries.find((e) => e.seasonId === editionId && !['withdrawn'].includes(e.status));
const rivalIds = computed(() => {
  const ids = new Set<string>();
  for (const c of openPlay.challenges) {
    for (const id of [c.homeClubId, c.awayClubId]) if (id && id !== openPlay.clubId) ids.add(id);
  }
  return ids;
});
const canChallengeAnyone = computed(() =>
  openPlay.activeEntries.some((e) => {
    const stages = (e.edition.definition as { Stages?: { type: string }[] } | null)?.Stages ?? [];
    return e.edition.status === 'running' && e.status === 'active' && stages[e.edition.currentStage]?.type !== 'knockout';
  })
);

function showClub(id: string) {
  if (filter.value === 'all') return true;
  if (filter.value === 'rivals') return rivalIds.value.has(id) || id === openPlay.clubId;
  return id === openPlay.clubId;
}
const showVenue = (e: EditionListItem) =>
  filter.value === 'all' || (filter.value === 'mine' && !!entryFor(e.id)) || (filter.value === 'open' && e.status === 'registration');

const visiblePlaces = computed(() => layout.value.places.filter((p) => p.clubs.some((c) => showClub(String(c.club._id)))));
const trayClubs = computed(() => layout.value.unplaced.filter((c) => showClub(String(c._id))).slice(0, 40));
const placeSize = (p: PlaceSpot) => 90 + ringRadius(p.clubs.length) * 2;

function crestSrc(code?: string | null) {
  return code && code in iconFileByName ? `/club-icons/${code}.svg` : null;
}
function placeName(c: ClubLite) {
  const a = c.Address;
  return [a?.City, a?.Country].filter(Boolean).join(', ') || (c.homePlaceId ? 'Home place' : 'Unplaced');
}

type Format = 'league' | 'cup' | 'groups' | 'event';
const FORMAT: Record<Format, { icon: string; tint: string }> = {
  league: { icon: '📊', tint: '#6366f1' },
  cup: { icon: '🏆', tint: '#f59e0b' },
  groups: { icon: '🔷', tint: '#14b8a6' },
  event: { icon: '🏁', tint: '#a855f7' },
};
function formatOf(e: EditionListItem): Format {
  const types = ((e.definition as { Stages?: { type: string }[] } | null)?.Stages ?? []).map((s) => s.type);
  if (types.length === 1 && types[0] === 'league') return 'league';
  if (types.length && types.every((t) => t === 'knockout')) return 'cup';
  if (types.includes('groups')) return 'groups';
  return 'event';
}
function venueStatus(e: EditionListItem) {
  const today = openPlay.settings?.currentDay ?? 0;
  if (e.status === 'registration') {
    const left = (e.registrationClosesDay ?? today) - today;
    return `Open for entry · ${Math.max(0, left)}d`;
  }
  const stages = (e.definition as { Stages?: { type: string }[] } | null)?.Stages ?? [];
  const s = stages[e.currentStage];
  return s ? (s.type === 'knockout' ? 'Knockout' : s.type === 'groups' ? 'Groups' : 'League') : 'Running';
}

const objects = computed<SceneObject[]>(() => {
  const out: SceneObject[] = [];
  for (const p of layout.value.places) {
    for (const { club, x, y } of p.clubs) {
      const id = String(club._id);
      if (!showClub(id)) continue;
      out.push({
        id: `club:${id}`,
        label: club.ClubCode || club.Name,
        x,
        y: y + 10,
        w: 20,
        h: 20,
        bare: true,
        pinImage: crestSrc(club.ClubCode),
        icon: '🛡️',
        badge: `L${levelOf(club)}`,
        tint: id === openPlay.clubId ? '#fbbf24' : rivalIds.value.has(id) ? '#ef4444' : null,
      });
    }
  }
  for (const e of editions.value) {
    if (!showVenue(e)) continue;
    const at = layout.value.venues.get(e.id);
    if (!at) continue;
    const f = formatOf(e);
    const plate = manifest.has(`map/venues/${f}.png`) ? `/world/map/venues/${f}.png` : null;
    out.push({
      id: `venue:${e.id}`,
      label: e.title,
      x: at.x,
      y: at.y,
      w: 90,
      h: 60,
      src: plate,
      bare: !plate,
      icon: FORMAT[f].icon,
      tint: FORMAT[f].tint,
      status: venueStatus(e),
      pinImage: e.winnerId ? crestSrc(dir.code(e.winnerId)) : null,
    });
  }
  return out;
});

function levelOf(c: ClubLite) {
  const t = openPlay.settings?.levelThresholds;
  const xp = c.XP ?? 0;
  let l = 0;
  while ((t && l + 1 < t.length ? t[l + 1]! : 100 * (l + 1) ** 2) <= xp) l++;
  return l;
}

const selectedClub = computed(() => (selectedId.value?.startsWith('club:') ? dir.get(selectedId.value.slice(5)) : undefined));
const selectedVenue = computed(() =>
  selectedId.value?.startsWith('venue:') ? editions.value.find((e) => e.id === selectedId.value!.slice(6)) : undefined
);

function onSelect(id: string) {
  selectedId.value = id;
}
function onDock(key: string) {
  if (key === 'hq') router.push(openPlay.clubId ? `/game/${openPlay.clubId}` : '/u');
  else if (key === 'competitions') router.push('/u/competitions');
  else if (key === 'office') router.push('/u');
  else if (key === 'squad' && myClub.value) router.push({ path: `/u/clubs/${myClub.value._id}/${myClub.value.ClubCode}`, query: { tab: '2' } });
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
    toast.value = 'Entered';
    await loadEditions();
  } catch (err) {
    const e = err as Error & { reasons?: string[] };
    toast.value = [e.message, ...(e.reasons ?? [])].join(' · ');
  } finally {
    entering.value = false;
  }
}

onMounted(() => openPlay.start());
watch(
  () => openPlay.clubId,
  () => void loadEditions().catch((err) => (toast.value = err instanceof Error ? err.message : String(err))),
  { immediate: true }
);
onUnmounted(() => openPlay.stop());
</script>

<style scoped>
.world-map {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #0f2233;
  color: #fff;
  user-select: none;
}
.wm-place {
  position: absolute;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(circle, rgba(250, 230, 180, 0.28), rgba(250, 230, 180, 0.08) 60%, transparent 72%);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  pointer-events: none;
}
.wm-place span {
  font-size: 11px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.7);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  transform: translateY(14px) scale(var(--inv, 1));
  white-space: nowrap;
}
.wm-filters {
  position: absolute;
  top: 76px;
  left: 16px;
  z-index: 20;
}
.wm-tray {
  position: absolute;
  left: 16px;
  bottom: 100px;
  z-index: 20;
  width: 220px;
  padding: 8px;
  border-radius: 14px;
  background: rgba(12, 19, 34, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.14);
}
.wm-tray-list {
  max-height: 220px;
  overflow-y: auto;
}
.wm-tray-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 4px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  text-align: left;
}
.wm-tray-item:hover {
  background: rgba(255, 255, 255, 0.08);
}
.wm-card {
  position: absolute;
  left: 50%;
  bottom: 110px;
  transform: translateX(-50%);
  z-index: 22;
  width: min(420px, calc(100vw - 32px));
}
@media (max-width: 720px) {
  .wm-tray {
    display: none;
  }
}
</style>
