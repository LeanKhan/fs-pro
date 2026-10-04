<template>
  <div ref="rootEl" class="cozy">
    <div v-if="clubQuery.isLoading.value || !game.campus.value" class="cg-state">Loading the grounds…</div>
    <div v-else-if="clubQuery.isError.value || !club" class="cg-state">
      <p>Could not load this club.</p>
      <router-link class="btn" to="/u">Back to dashboard</router-link>
    </div>

    <template v-else>
      <cozy-campus
        ref="campusRef"
        :view="view"
        :variant="variant"
        :selected="moving ? null : selectedKey"
        :ghost="ghost"
        :timers="timers"
        :alerts="alerts"
        :now-ms="game.now.value"
        @tap="onTap"
        @hover="onHover"
        @alert="onAlert"
      />

      <cozy-hud
        v-model:quick-sim="quickSim"
        :club="{ name: club.Name, code: club.ClubCode, location: clubLocation, elo: club.Elo ?? 1500 }"
        :level="{ level: playState?.club.level ?? 0, xpInto: playState?.club.xpIntoLevel ?? 0, xpNeed: playState?.club.xpForNext ?? 0 }"
        :stats="{
          budget: treasury,
          fans: playState?.standing.fans ?? 0,
          reputation: playState?.standing.reputation ?? 0,
          power: playState?.club.power ?? 0,
          entriesUsed: isMyClub ? openPlay.entriesUsed : 0,
          maxEntries: isMyClub ? (openPlay.settings?.maxConcurrentEntries ?? null) : null,
        }"
        :facts="facts"
        :challenge="isMyClub ? (playState?.challenge ?? null) : null"
        :briefing="isMyClub ? managerBriefingMessage : ''"
        :headline="tickerHeadline"
        :builders="builders"
        :inbox="openPlay.incoming.length"
        :is-mine="isMyClub"
        :moving="!!moving"
        :cooldown="game.cooldownLeft.value"
        :playing="game.playing.value"
        @act="onAct"
      />

      <cozy-panel
        v-if="selectedKey && !moving"
        :building-key="selectedKey"
        :asset="selectedAsset"
        :is-mine="isMyClub"
        :budget="treasury"
        :busy="game.upgradingAsset.value !== null"
        :now-ms="game.now.value"
        :door="doorFor(selectedKey)?.label ?? null"
        :alert="alerts[selectedKey]?.label ?? null"
        :club-level="playState?.club.level ?? 0"
        :staff-tier="tierOf('staff_house')"
        @close="selectedKey = null"
        @upgrade="game.startUpgrade"
        @move="startMove"
        @open="onOpen"
      />

      <cozy-modal v-model="showBuild" size="wide">
        <h2><span v-html="icon('hammer')"></span> Build</h2>
        <p class="sub">{{ game.campus.value.activeUpgrades }}/{{ game.campus.value.maxConcurrentUpgrades }} builders busy</p>
        <div class="cards">
          <button v-for="a in game.campus.value.assets" :key="a.type" class="card" :class="{ off: !!a.next?.blockedReason && !a.upgrade }" @click="pickFromMenu(a.type)">
            <div class="card-title">{{ stageName(a.type as CampusBuilding, { tier: a.level, clubLevel: 0, staffTier: 0 }) }}</div>
            <div class="card-art" :class="`art-${a.type}`"></div>
            <div class="card-desc">{{ a.name }} · Tier {{ a.level }} · {{ a.effectLabel }}</div>
            <div v-if="a.next" class="card-meta">Next: {{ stageName(a.type as CampusBuilding, { tier: a.next.level, clubLevel: 0, staffTier: 0 }) }}</div>
            <div v-if="a.upgrade" class="card-meta">Building Tier {{ a.upgrade.toLevel }}…</div>
            <div v-else-if="a.next" class="chips"><span class="chip"><span v-html="icon('coins')"></span>{{ currency(a.next.cost) }}</span></div>
            <div v-if="a.next?.blockedReason && !a.upgrade" class="card-why">{{ a.next.blockedReason }}</div>
          </button>
        </div>
      </cozy-modal>

      <cozy-modal v-model="game.showMatchmaking.value" size="wide">
        <cozy-matchmaking
          :my-power="playState?.club.power ?? 0"
          :opponents="game.opponentOptions.value"
          :selected-id="game.matchedOpponent.value?.id ?? null"
          :searching="game.matchmakingSearching.value"
          :starting="game.playing.value || busArriving"
          :tactics="tacticsSummary"
          @select="game.selectOpponent"
          @play="kickOff"
          @tactics="onChangeTactics"
          @medical="onOpenMedicalFromMatchmaking"
        />
      </cozy-modal>

      <cozy-modal v-model="game.showRewards.value">
        <cozy-rewards
          v-if="game.matchResult.value"
          :result="game.matchResult.value"
          :my-name="club.Name"
          :my-code="club.ClubCode"
          @close="game.showRewards.value = false"
          @again="(game.showRewards.value = false), game.findMatch(quickSim)"
        />
      </cozy-modal>

      <!-- Dashboard screens and world news, over the campus -->
      <cozy-drawer
        :model-value="!!drawer"
        :title="drawerTitle"
        :tabs="drawerDoor?.tabs.map((t) => t.title)"
        :tab="drawerTab"
        @update:model-value="(open) => !open && closeDrawer()"
        @update:tab="(i) => (drawerTab = i)"
      >
        <component
          :is="drawerDoor.tabs[drawerTab].component"
          v-if="drawerDoor"
          :key="`${drawer}-${drawerTab}`"
          :club="club"
          v-bind="drawerDoor.tabs[drawerTab].readOnly ? { readOnly: !isMyClub } : {}"
          @update-available="onZoneUpdate"
          @switch-tab="onZoneSwitchTab"
        />
        <cozy-news v-else-if="drawer === 'news'" :feed="worldFeed" />
        <cozy-news v-else-if="drawer === 'billboard'" :feed="worldFeed" category="transfer">
          <div v-if="transferWindow" class="warn" :class="{ good: transferWindow.open }">
            {{ transferWindow.open ? `Transfer window open${transferWindow.daysLeft !== null ? ` · ${transferWindow.daysLeft} days left` : ''}` : 'Transfer window closed' }}
          </div>
          <button v-if="isMyClub" class="btn primary" @click="openDoor('scouting')">Open my Transfers</button>
        </cozy-news>
      </cozy-drawer>

      <cozy-modal v-model="showAwaySummary" size="small">
        <h2><span v-html="icon('mail')"></span> While you were away</h2>
        <ul class="away">
          <li v-for="(e, i) in awayEvents" :key="i"><span>{{ e.icon }}</span><span><b>{{ e.title }}</b><br />{{ e.description }}</span></li>
        </ul>
        <div class="row-btns"><button class="btn primary" @click="showAwaySummary = false">Let's go!</button></div>
      </cozy-modal>

      <div class="toasts">
        <div v-if="game.snackbar.value" class="toast" :class="game.snackbarColor.value === 'error' ? 'bad' : 'good'">{{ game.snackbarText.value }}</div>
      </div>

      <!-- Challenges keep their existing screens. -->
      <side-sheet v-model="showInbox" :width="400">
        <div class="d-flex align-center pa-3">
          <div class="text-subtitle-1 font-weight-bold">Challenges</div>
          <v-spacer />
          <v-btn size="small" color="teal" variant="flat" prepend-icon="mdi-sword-cross" @click="showChallenge = true">Challenge</v-btn>
        </div>
        <div class="px-3"><challenge-inbox /></div>
      </side-sheet>
      <challenge-dialog v-model="showChallenge" :preselect-club-id="isMyClub ? null : clubId" />
      <facility-detail-sheet
        v-model="showTreatment"
        :club-id="clubId"
        :asset="medicalAsset"
        icon="➕"
        :read-only="!isMyClub"
        :upgrading="game.upgradingAsset.value !== null"
        :now-ms="game.now.value"
        :budget="game.campus.value?.budget ?? null"
        @upgrade="game.startUpgrade"
        @treated="onMedicalTreated"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import '@/components/cozy/cozy.scss';
import { computed, onMounted, onUnmounted, ref, watch, type Component } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import {
  CAMPUS_GRID, footprint, validatePlacement,
  type CampusBuilding, type CampusPlacement, type Placed, type TransferWindow, type WorldFeed,
} from '@repo/api-contract';
import { client } from '@/services/api';
import { useStore } from '@/store';
import { useOpenPlayStore } from '@/store/open-play';
import { useClubGame } from '@/composables/use-club-game';
import { useClubDirectory } from '@/helpers/open-play';
import { currency } from '@/helpers/misc';
import SideSheet from '@/components/world/side-sheet.vue';
import ChallengeInbox from '@/components/open-play/challenge-inbox.vue';
import ChallengeDialog from '@/components/open-play/challenge-dialog.vue';
import FacilityDetailSheet from '@/components/campus/facility-detail-sheet.vue';
import CozyCampus from '@/components/cozy/cozy-campus.vue';
import CozyHud from '@/components/cozy/cozy-hud.vue';
import CozyPanel from '@/components/cozy/cozy-panel.vue';
import CozyModal from '@/components/cozy/cozy-modal.vue';
import CozyMatchmaking from '@/components/cozy/cozy-matchmaking.vue';
import CozyRewards from '@/components/cozy/cozy-rewards.vue';
import CozyDrawer from '@/components/cozy/cozy-drawer.vue';
import CozyNews from '@/components/cozy/cozy-news.vue';
import TeamSheetZone from '@/views/user/club/zones/team-sheet-zone.vue';
import SquadZone from '@/views/user/club/zones/squad-zone.vue';
import TransferZone from '@/views/user/club/zones/transfer-zone.vue';
import OwnerZone from '@/views/user/club/zones/owner-zone.vue';
import PerformanceZone from '@/views/user/club/zones/performance-zone.vue';
import ClubZone from '@/views/user/club/zones/club-zone.vue';
import { useClubRefresh } from '@/composables/use-club-refresh';
import { clubColors } from '@/components/cozy/club-colors';
import { stageName } from '@/components/cozy/stages';
import { icon } from '@/components/cozy/icons';
import { showMatch } from '@/components/cozy/match-view';
import { CELL } from '@/components/cozy/scene/models';
import { renderThumbs } from '@/components/cozy/scene/thumbs';
import type { CityVariant } from '@/components/cozy/scene/terrain';
import type { Pick } from '@/components/cozy/scene/world';

const route = useRoute();
const router = useRouter();
const store = useStore();
const openPlay = useOpenPlayStore();
const directory = useClubDirectory();
const showInbox = ref(false);
const showChallenge = ref(false);
onMounted(() => openPlay.start());
onUnmounted(() => openPlay.stop());

if (!store.isAuthenticated) store.getUser();
if (!store.calendar) store.setCalendar();

const clubId = computed(() => route.params.clubId as string);

const clubQuery = useQuery({
  queryKey: computed(() => ['club', clubId.value]),
  queryFn: async () => {
    const response = await client.clubs.getClub.query({
      params: { id: clubId.value },
      query: { populate: 'true' },
    });
    if (response.status !== 200) throw new Error(response.body.message);
    return response.body.payload;
  },
  enabled: computed(() => !!clubId.value),
});

const club = computed(() => clubQuery.data.value ?? null);
const game = useClubGame(clubId, () => clubQuery.refetch());
const playState = computed(() => game.playState.value);
const rootEl = ref<HTMLElement | null>(null);
const campusRef = ref<InstanceType<typeof CozyCampus> | null>(null);

const isMyClub = computed(() => {
  const id = club.value?._id;
  const owned = store.user?.clubs;
  if (!id || !Array.isArray(owned)) return false;
  return owned.some((c: any) => (typeof c === 'string' ? c : c._id) === id);
});

const treasury = computed(() => playState.value?.club.budget ?? club.value?.Budget ?? 0);

const clubLocation = computed(() => {
  const city = (club.value as any)?.City || (club.value as any)?.HomePlace?.Name || 'Abuja';
  const country = (club.value as any)?.Country || 'Nigeria';
  return `${city}, ${country}`;
});

// --- The 3D campus ------------------------------------------------------------------
const colors = ref<[string, string]>(['#3a6fd8', '#f5f1e6']);
watch(
  () => club.value?.ClubCode,
  async (code) => {
    if (!code) return;
    colors.value = await clubColors(code);
    renderThumbs(colors.value);
  },
  { immediate: true }
);

const variant = computed(() => ((club.value as any)?.CampusLayout ?? 'city') as CityVariant);

// Match day: an accepted challenge for today.
const todaysMatch = computed(() => {
  if (!isMyClub.value) return null;
  const today = openPlay.settings?.currentDay;
  return openPlay.upcoming.find((c) => c.scheduledDay === today) ?? null;
});

const view = computed(() => {
  const campus = game.campus.value;
  if (!campus) return null;
  const tiers = Object.fromEntries(campus.assets.map((a) => [a.type, { tier: a.level, upgrading: !!a.upgrade }]));
  const players = ((club.value as any)?.Players ?? []).map((p: any) => ({
    id: String(p._id),
    name: `${p.FirstName ?? ''} ${p.LastName ?? ''}`.trim(),
    injured: Number(p.Injury?.daysRemaining) > 0,
  }));
  return {
    tiers,
    placement: draft.value ?? (campus.placement as CampusPlacement),
    players,
    fans: playState.value?.standing.fans ?? 0,
    matchDay: !!todaysMatch.value,
    clubLevel: playState.value?.club.level ?? 0,
    colors: colors.value,
  };
});

const timers = computed(() =>
  Object.fromEntries(
    (game.campus.value?.assets ?? [])
      .filter((a) => a.upgrade)
      .map((a) => [a.type, { start: new Date(a.upgrade!.startAt).getTime(), end: new Date(a.upgrade!.completeAt).getTime() }])
  )
);

const builders = computed(() => {
  const campus = game.campus.value;
  const next = campus?.assets.filter((a) => a.upgrade).sort((a, b) => a.upgrade!.completeAt.localeCompare(b.upgrade!.completeAt))[0];
  if (!campus || !next) return null;
  return {
    name: next.name,
    secondsLeft: Math.max(0, Math.ceil((new Date(next.upgrade!.completeAt).getTime() - game.now.value) / 1000)),
    active: campus.activeUpgrades,
    max: campus.maxConcurrentUpgrades,
  };
});

// --- Date and facts (as on the dashboard) ---------------------------------------------
const facts = computed(() => {
  const cal = store.calendar as any;
  const upcoming = isMyClub.value
    ? [...openPlay.upcoming].sort((a, b) => (a.scheduledDay ?? 0) - (b.scheduledDay ?? 0))[0]
    : undefined;
  const opponentId = upcoming && (upcoming.homeClubId === openPlay.clubId ? upcoming.awayClubId : upcoming.homeClubId);
  return {
    day: cal ? `Day ${cal.CurrentDay}${cal.CurrentDate ? ` · ${new Date(cal.CurrentDate).toDateString()}` : ''}` : '…',
    year: openPlay.settings
      ? { currentYear: openPlay.settings.currentYear, dayOfYear: openPlay.settings.dayOfYear, yearLengthDays: openPlay.settings.yearLengthDays }
      : null,
    next: upcoming
      ? {
          opponent: directory.name(opponentId),
          home: upcoming.homeClubId === openPlay.clubId,
          day: upcoming.scheduledDay,
          today: upcoming.scheduledDay === openPlay.settings?.currentDay,
        }
      : null,
    performance: isMyClub.value && openPlay.performance ? { score: openPlay.performance.score, expected: openPlay.performance.expected } : null,
    form: playState.value?.standing.form ?? [],
    fanApproval: playState.value?.standing.fanApproval ?? null,
  };
});

// --- Selection and panels ----------------------------------------------------------------
const selectedKey = ref<CampusBuilding | null>(null);
const tierOf = (type: string) => game.campus.value?.assets.find((a) => a.type === type)?.level ?? 0;
const selectedAsset = computed(() => game.campus.value?.assets.find((a) => a.type === selectedKey.value) ?? null);
const medicalAsset = computed(() => game.campus.value?.assets.find((a) => a.type === 'medical_centre') ?? null);
const showBuild = ref(false);
const showTreatment = ref(false);

function onTap(pick: Pick, ground: { x: number; z: number } | null) {
  if (moving.value) {
    if (pick?.kind === 'building' && pick.id !== moving.value.key) return startMove(pick.id as CampusBuilding);
    if (ground) placeGhost(ground);
    return;
  }
  if (pick?.kind === 'building') selectedKey.value = pick.id as CampusBuilding;
  else if (pick?.kind === 'place') openPlace(pick.id);
  else if (pick?.kind === 'player') {
    const p = ((club.value as any)?.Players ?? []).find((x: any) => String(x._id) === pick.id);
    if (p) game.snackbarText.value = `${p.FirstName} ${p.LastName} · ${p.Position ?? ''} · ★${Math.round(p.Rating ?? 0)}`;
    game.snackbarColor.value = 'success';
    game.snackbar.value = true;
  } else selectedKey.value = null;
}

function pickFromMenu(key: string) {
  showBuild.value = false;
  selectedKey.value = key as CampusBuilding;
  const p = view.value!.placement[key as CampusBuilding];
  const [w, d] = footprint(key as CampusBuilding, p.rot);
  campusRef.value?.focus((p.x + w / 2) * CELL, (p.z + d / 2) * CELL);
}

function onOpen(what: string) {
  if (what === 'treatment') showTreatment.value = true;
  else if (what === 'door' && selectedKey.value) openDoor(selectedKey.value);
}

// --- Doors: buildings open their dashboard screens over the campus ---------------------------
interface Door { label: string; tabs: { title: string; component: Component; readOnly?: boolean }[] }
const DOORS: Partial<Record<CampusBuilding, Door>> = {
  dugout: { label: 'Team Sheet', tabs: [{ title: 'Team Sheet', component: TeamSheetZone, readOnly: true }] },
  training_ground: { label: 'Squad', tabs: [{ title: 'Squad', component: SquadZone }] },
  scouting: { label: 'Transfers', tabs: [{ title: 'Transfers', component: TransferZone }] },
  office: {
    label: 'Office',
    tabs: [
      { title: "Director's Box", component: OwnerZone, readOnly: true },
      { title: 'Analysis', component: PerformanceZone },
      { title: 'Manager', component: ClubZone },
    ],
  },
};

/** The door for a building; visitors only get the screens that have a read-only mode. */
function doorFor(key: CampusBuilding | null): Door | null {
  const door = key ? DOORS[key] : undefined;
  if (!door) return null;
  if (isMyClub.value) return door;
  const tabs = door.tabs.filter((t) => t.readOnly);
  return tabs.length ? { ...door, tabs } : null;
}

const drawer = ref<CampusBuilding | 'news' | 'billboard' | null>(null);
const drawerTab = ref(0);
const drawerDoor = computed(() =>
  drawer.value && drawer.value !== 'news' && drawer.value !== 'billboard' ? doorFor(drawer.value) : null
);
const drawerTitle = computed(() =>
  drawer.value === 'news' ? 'Around the world' : drawer.value === 'billboard' ? 'Transfer highlights' : (drawerDoor.value?.label ?? '')
);

function openDoor(key: CampusBuilding) {
  if (!doorFor(key)) return;
  selectedKey.value = null;
  drawerTab.value = 0;
  drawer.value = key;
}

function closeDrawer() {
  drawer.value = null;
  loadOffers();
}

const refreshClub = useClubRefresh();
async function onZoneUpdate() {
  await refreshClub(clubId.value);
  game.load();
}

/** The Analysis screen links to other dashboard tabs by index (dashboard.vue). */
function onZoneSwitchTab(tab: number) {
  const byTab: Record<number, CampusBuilding> = { 1: 'dugout', 2: 'training_ground', 4: 'office', 5: 'scouting' };
  if (byTab[tab]) openDoor(byTab[tab]);
}

// --- Alerts: what needs attention, on the building it concerns ----------------------------------
const offersAwaiting = ref(0);
async function loadOffers() {
  if (!isMyClub.value || !clubId.value) return;
  const res = await client.transfers.getOffers.query({ query: { clubId: clubId.value } });
  if (res.status === 200) {
    offersAwaiting.value = res.body.payload.filter((o) => o.awaiting === 'me' && ['pending', 'countered'].includes(o.status)).length;
  }
}

const alerts = computed(() => {
  const out: Record<string, { icon: string; label: string; count?: number }> = {};
  if (newsUnseen.value) out.newsstand = { icon: 'news', label: 'New headlines' };
  if (!isMyClub.value) return out;
  if (tacticsSummary.value?.issues.length) out.dugout = { icon: 'alert', label: tacticsSummary.value.issues.join(' · ') };
  const injured = view.value?.players.filter((p: { injured: boolean }) => p.injured).length ?? 0;
  if (injured) out.medical_centre = { icon: 'cross', count: injured, label: `${injured} player${injured > 1 ? 's' : ''} injured` };
  if (offersAwaiting.value) {
    const n = offersAwaiting.value;
    out.scouting = { icon: 'mail', count: n, label: `${n} transfer offer${n > 1 ? 's' : ''} waiting for your answer` };
  }
  return out;
});

/** Badges: transfer offers go straight to Transfers, the newsstand opens the news, the rest the quick card. */
function onAlert(key: string) {
  if (key === 'scouting') openDoor('scouting');
  else if (key === 'newsstand') openPlace(key);
  else selectedKey.value = key as CampusBuilding;
}

// --- The world: newsstand, billboard and the headline ticker --------------------------------------
const worldFeed = ref<WorldFeed | null>(null);
const transferWindow = ref<TransferWindow | null>(null);
const NEWS_SEEN_KEY = 'fspro_news_seen';
const newsSeen = ref(localStorage.getItem(NEWS_SEEN_KEY));
const newsUnseen = computed(() => !!worldFeed.value?.headlines[0] && worldFeed.value.headlines[0].id !== newsSeen.value);
const tickerIndex = ref(0);
const tickerHeadline = computed(() => {
  const h = worldFeed.value?.headlines ?? [];
  return h.length ? h[tickerIndex.value % h.length].title : null;
});

async function loadWorldFeed() {
  const res = await client.calendar.getWorldFeed.query({});
  if (res.status === 200) worldFeed.value = res.body.payload;
}

watch([() => worldFeed.value?.headlines, campusRef], ([headlines]) =>
  campusRef.value?.setBillboard((headlines ?? []).filter((h) => h.category === 'transfer').map((h) => h.title))
);

async function openPlace(id: string) {
  selectedKey.value = null;
  if (id === 'newsstand') {
    drawer.value = 'news';
    newsSeen.value = worldFeed.value?.headlines[0]?.id ?? null;
    if (newsSeen.value) localStorage.setItem(NEWS_SEEN_KEY, newsSeen.value);
  } else if (id === 'billboard') {
    drawer.value = 'billboard';
    const res = await client.transfers.getTransferWindow.query();
    if (res.status === 200) transferWindow.value = res.body.payload;
  }
}

loadWorldFeed();
watch(isMyClub, (mine) => mine && loadOffers(), { immediate: true });
const worldTimer = setInterval(() => {
  loadWorldFeed();
  loadOffers();
}, 60_000);
const tickerTimer = setInterval(() => tickerIndex.value++, 8_000);
onUnmounted(() => {
  clearInterval(worldTimer);
  clearInterval(tickerTimer);
});

// --- Move mode -------------------------------------------------------------------------
const draft = ref<CampusPlacement | null>(null);
const moving = ref<{ key: CampusBuilding | null } | null>(null);
const ghost = computed(() => {
  const key = moving.value?.key;
  if (!key || !draft.value) return null;
  return { key, at: draft.value[key], valid: !validatePlacement(draft.value) };
});

function startMove(key?: CampusBuilding) {
  if (!draft.value) draft.value = JSON.parse(JSON.stringify(game.campus.value!.placement)) as CampusPlacement;
  moving.value = { key: key ?? selectedKey.value };
  selectedKey.value = null;
}

function placeGhost(ground: { x: number; z: number }) {
  const key = moving.value?.key;
  if (!key || !draft.value) return;
  const p = draft.value[key];
  const [w, d] = footprint(key, p.rot);
  const x = Math.round(ground.x / CELL - w / 2);
  const z = Math.round(ground.z / CELL - d / 2);
  if (x < CAMPUS_GRID.minX || z < CAMPUS_GRID.minZ || x + w - 1 > CAMPUS_GRID.maxX || z + d - 1 > CAMPUS_GRID.maxZ) return;
  draft.value = { ...draft.value, [key]: { ...p, x, z } satisfies Placed };
}

function onHover(ground: { x: number; z: number }) {
  if (moving.value?.key) placeGhost(ground);
}

async function onMoveAct(action: string) {
  const key = moving.value?.key;
  if (action === 'move-rotate' && key && draft.value) {
    const p = draft.value[key];
    draft.value = { ...draft.value, [key]: { ...p, rot: (p.rot + 1) % 4 } };
  } else if (action === 'move-cancel') {
    moving.value = null;
    draft.value = null;
  } else if (action === 'move-save' && draft.value) {
    const problem = validatePlacement(draft.value);
    if (problem) return toast(problem.replace(/^\w+/, (k) => game.campus.value?.assets.find((a) => a.type === k)?.name ?? k), 'error');
    if (await game.savePlacement(draft.value)) {
      moving.value = null;
      draft.value = null;
    }
  }
}

function toast(text: string, color = 'success') {
  game.snackbarText.value = text;
  game.snackbarColor.value = color;
  game.snackbar.value = true;
}
watch(game.snackbar, (on) => on && setTimeout(() => (game.snackbar.value = false), 3000));

// --- Matches and travel --------------------------------------------------------------------
const quickSim = ref(localStorage.getItem('fspro_play_mode') === 'quick_sim');
watch(quickSim, (q) => localStorage.setItem('fspro_play_mode', q ? 'quick_sim' : 'battle'));
const busArriving = ref(false);

/** Home match: the visitors' bus pulls up, then the match is played. */
async function kickOff() {
  const opp = game.matchedOpponent.value;
  if (!opp) return;
  if (!quickSim.value) {
    game.showMatchmaking.value = false;
    busArriving.value = true;
    await campusRef.value?.playArrival(await clubColors(opp.code));
    busArriving.value = false;
  }
  await game.startBattle(quickSim.value);
}

watch(game.showBattleArena, async (open) => {
  const r = game.matchResult.value;
  if (!open || !r || !club.value || !rootEl.value) return;
  await showMatch(
    {
      home: { name: club.value.Name, colors: colors.value },
      away: { name: r.opponent.name, colors: await clubColors(r.opponent.code) },
      highlights: r.highlights ?? [],
      score: [r.score.you, r.score.them],
    },
    rootEl.value
  );
  game.finishBattle();
});

/** Away match today: the bus leaves, and the host's grounds open with it arriving. */
async function travel() {
  const m = todaysMatch.value;
  if (!m?.homeClubId) return;
  await campusRef.value?.playDeparture(colors.value);
  router.push({ path: `/game/${m.homeClubId}`, query: { arriving: '1' } });
}

watch(
  () => !!game.campus.value && route.query.arriving === '1',
  async (ready) => {
    if (!ready || !openPlay.clubId) return;
    await new Promise((r) => setTimeout(r, 300));
    await campusRef.value?.playArrival(await clubColors(directory.code(openPlay.clubId)));
    router.replace({ query: {} });
  },
  { immediate: true }
);

function onAct(action: string) {
  if (action.startsWith('move-')) return onMoveAct(action);
  switch (action) {
    case 'build': return (showBuild.value = true);
    case 'move': return startMove();
    case 'play': return game.findMatch(quickSim.value);
    case 'inbox': return (showInbox.value = true);
    case 'challenge': return (showChallenge.value = true);
    case 'competitions': return router.push('/u/competitions');
    case 'world': return router.push('/world');
    case 'home': return router.push(openPlay.clubId ? `/game/${openPlay.clubId}` : '/u');
    case 'travel': return travel();
    case 'squad': return openDoor('training_ground');
    case 'tactics': return openDoor('dugout');
    case 'news': return openPlace('newsstand');
    case 'settings':
    case 'club': return goManager('club');
    default: return goManager(action);
  }
}

// --- Kept from the previous campus screen ---------------------------------------------------
const FORMATION_LABELS: Record<string, string> = { '433': '4-3-3', '442': '4-4-2', '4231': '4-2-3-1', '352': '3-5-2' };
const tacticsSummary = computed(() => {
  const c = club.value as any;
  if (!c) return null;
  const formationRaw = c.Tactic?.formationName as string | undefined;
  const formationLabel = formationRaw ? FORMATION_LABELS[formationRaw] ?? formationRaw : 'Not set';
  const startingIds: string[] = Array.isArray(c.Lineup?.startingXI) ? c.Lineup.startingXI : [];
  const players: any[] = Array.isArray(c.Players) ? c.Players : [];
  const starters = startingIds.map((id) => players.find((p) => String(p._id) === id)).filter(Boolean);
  const injuredCount = starters.filter((p) => p.Injury && Number(p.Injury.daysRemaining) > 0).length;
  const issues: string[] = [];
  if (starters.length < 11) issues.push(`${11 - starters.length} lineup slot(s) empty`);
  if (injuredCount > 0) issues.push(`${injuredCount} starter(s) injured`);
  return { formationLabel, filledCount: starters.length, issues, ready: issues.length === 0 };
});

function onChangeTactics() {
  game.showMatchmaking.value = false;
  openDoor('dugout');
}

function onMedicalTreated() {
  clubQuery.refetch();
  game.load();
}

function onOpenMedicalFromMatchmaking() {
  game.showMatchmaking.value = false;
  showTreatment.value = true;
}

const managerBriefingMessage = computed(() => {
  const standing = playState.value?.standing;
  const streak = standing?.streak;
  if (streak && streak.length >= 3 && streak.type === 'L') {
    return standing!.boardConfidence < 35
      ? `${streak.length} defeats in a row. The board is losing patience and the crowds are thinning - we need a result.`
      : `${streak.length} defeats in a row. The dressing room is low and the fans are restless.`;
  }
  if (streak && streak.length >= 3 && streak.type === 'W') {
    return `${streak.length} wins on the bounce! The squad is flying and the supporters are pouring in.`;
  }
  if (game.cooldownLeft.value > 0) return 'The squad is resting and recovering fitness between matches.';
  if (!standing?.form.length) return 'Your journey starts here. Build your club, train your team and take on your first opponents.';
  return 'Every result counts: wins bring fans through the gates, defeats send them home.';
});

// While you were away
const showAwaySummary = ref(false);
const awayEvents = ref<{ icon: string; title: string; description: string }[]>([]);
const INBOX_ICONS: Record<string, string> = { fans: '📣', board: '🏛️', squad: '👥', press: '📰' };

function checkOfflineProgress() {
  if (!clubId.value) return;
  const storageKey = `fspro_last_seen_${clubId.value}`;
  const rawLastSeen = localStorage.getItem(storageKey);
  const nowTime = Date.now();
  localStorage.setItem(storageKey, String(nowTime));

  const events = (game.inbox.value?.messages ?? [])
    .filter((m) => !m.read)
    .slice(0, 5)
    .map((m) => ({ icon: INBOX_ICONS[m.kind] ?? '📰', title: m.title, description: m.body }));
  const away = rawLastSeen ? (nowTime - Number(rawLastSeen)) / 1000 : 0;
  // Inbox news always shows; otherwise only after more than 2 minutes away.
  if (!events.length && away < 120) return;

  for (const a of game.campus.value?.assets ?? []) {
    if (!a.upgrade) continue;
    const done = new Date(a.upgrade.completeAt).getTime() <= nowTime;
    events.push({
      icon: done ? '🏗️' : '🔨',
      title: done ? `${a.name} upgrade ready` : `Work continues: ${a.name}`,
      description: done ? 'Construction finished while you were away.' : `Building towards Tier ${a.upgrade.toLevel}.`,
    });
  }
  if (game.cooldownLeft.value === 0) events.push({ icon: '⚡', title: 'Squad rested', description: 'The players are ready to play.' });
  awayEvents.value = events;
  showAwaySummary.value = events.length > 0;
}

let checkedOffline = false;
watch(
  () => game.campus.value,
  async (loaded) => {
    if (!loaded || checkedOffline || !isMyClub.value) return;
    checkedOffline = true;
    await game.loadInbox();
    checkOfflineProgress();
  }
);
watch(showAwaySummary, (open) => !open && game.markInboxRead());
watch(
  () => game.showRewards.value,
  async (open) => {
    if (open || !isMyClub.value) return;
    await game.loadInbox();
    if (game.inbox.value?.unread) checkOfflineProgress();
  }
);

function goManager(key?: string) {
  const c = club.value;
  if (!c) return;
  // Indices into the manager dashboard's v-tabs (dashboard.vue): Home, Team
  // Sheet, Squad Zone, Club Zone, Director's Box, Transfer Zone, Analysis.
  const tabs: Record<string, number> = { tactics: 1, squad: 2, club: 3, transfers: 5 };
  router.push({
    path: `/u/clubs/${c._id}/${c.ClubCode}`,
    query: key && key in tabs ? { tab: String(tabs[key]) } : {},
  });
}
</script>

<style scoped>
.cg-state {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  gap: 12px;
  text-align: center;
  font-size: 20px;
}
</style>
