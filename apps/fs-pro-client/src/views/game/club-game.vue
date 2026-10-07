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
        :suspended="matchOpen || !!watching"
        :collector="collector"
        @tap="onTap"
        @hover="onHover"
        @alert="onAlert"
        @collect="collect"
      />

      <cozy-presence v-if="clubId" :club-id="clubId" :club-name="club.Name" :is-mine="isMyClub" @notify="(t: string) => game.toast(t)" />

      <cozy-hud
        :club="{ name: club.Name, code: club.ClubCode }"
        :level="{ level: playState?.club.level ?? 0, xpInto: playState?.club.xpIntoLevel ?? 0, xpNeed: playState?.club.xpForNext ?? 0 }"
        :stats="{
          budget: treasury,
          fans: playState?.standing.fans ?? 0,
          reputation: playState?.standing.reputation ?? 0,
          power: playState?.club.power ?? 0,
        }"
        :league="leagueBadge"
        :facts="facts"
        :challenge="isMyClub ? (playState?.challenge ?? null) : null"
        :first-steps="firstSteps"
        :coach="coach"
        :briefing="isMyClub ? managerBriefingMessage : ''"
        :headline="tickerHeadline"
        :builders="builders"
        :inbox="openPlay.incoming.length"
        :is-mine="isMyClub"
        :moving="!!moving"
        :cooldown="game.cooldownLeft.value"
        :playing="game.playing.value"
        :quick-sim="quickSim"
        :live="liveMatch ? { opponent: liveMatch.opponent.name, home: liveMatch.home } : null"
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
          :booking="game.bookingMode.value"
          :cooldown="game.cooldownLeft.value"
          @select="game.selectOpponent"
          @play="kickOff"
          @book="onBook"
          @tactics="onChangeTactics"
          @medical="onOpenMedicalFromMatchmaking"
        />
      </cozy-modal>

      <matchzone-view
        v-if="matchOpen"
        :fixture-id="game.matchResult.value!.fixtureId"
        overlay
        autoplay
        @close="game.finishBattle()"
      />
      <matchzone-view
        v-if="watching"
        :key="watching.fixtureId"
        :fixture-id="watching.fixtureId"
        overlay
        autoplay
        :live-from-ms="watching.liveFromMs"
        @close="closeWatching"
      />

      <cozy-modal v-model="game.showRewards.value">
        <cozy-rewards
          v-if="game.matchResult.value && game.showRewards.value"
          :result="game.matchResult.value"
          :my-name="club.Name"
          :my-code="club.ClubCode"
          :cooldown="game.cooldownLeft.value"
          :level-reached="rewardLevel"
          @close="game.showRewards.value = false"
          @again="(game.showRewards.value = false), game.findMatch(quickSim)"
        />
      </cozy-modal>

      <cozy-modal v-model="showSettings" size="small">
        <cozy-settings v-model:quick-sim="quickSim" :user-name="store.user?.fullname ?? store.user?.username" @act="onSettingsAct" />
      </cozy-modal>

      <!-- Dashboard screens and world news, over the campus -->
      <cozy-drawer
        :model-value="!!drawer"
        :title="drawerTitle"
        :tabs="drawer === 'league' ? ['My league', 'Competitions'] : drawer === 'hub' ? hubTabs.map((t) => t.title) : undefined"
        :tab="drawerTab"
        @update:model-value="(open) => !open && closeDrawer()"
        @update:tab="(i) => (drawerTab = i)"
      >
        <template v-if="drawer === 'hub' && hubTab">
          <cozy-matchday
            v-if="hubTab.key === 'matchday'"
            :club-id="clubId"
            :now-ms="game.now.value"
            :refresh-key="matchdayKey"
            @prep="openPrep"
            @watch="watchFixture"
            @book="startBooking"
          />
          <component
            :is="hubTab.component"
            v-else
            :key="`hub-${hubTab.key}`"
            :club="club"
            v-bind="{ ...(hubTab.readOnly ? { readOnly: !isMyClub } : {}), ...(hubTab.key === 'club' ? { inGame: true } : {}) }"
            @update-available="onZoneUpdate"
            @switch-tab="onZoneSwitchTab"
          />
        </template>
        <template v-else-if="drawer === 'prep' && prepFixtureId">
          <button class="btn small backbtn" @click="openHub('matchday')">‹ Matchday</button>
          <cozy-match-prep
            :club-id="clubId"
            :fixture-id="prepFixtureId"
            :my-name="club.Name"
            :my-code="club.ClubCode"
            :now-ms="game.now.value"
            @saved="onPlanSaved"
            @toast="toast"
          />
        </template>
        <template v-else-if="drawer === 'league'">
          <cozy-league
            v-if="drawerTab === 0"
            :league="playState?.league ?? null"
            :club-id="clubId"
            :my-name="club.Name"
            :my-code="club.ClubCode"
            :elapsed="leagueElapsed"
            @visit="(id: string) => router.push(`/game/${id}`)"
            @tactics="playState?.league?.next ? openPrep(playState.league.next.fixtureId) : openHub('team')"
            @competitions="drawerTab = 1"
          />
          <user-competitions v-else />
        </template>
        <cozy-news v-else-if="drawer === 'news'" :feed="worldFeed" />
        <cozy-news v-else-if="drawer === 'billboard'" :feed="worldFeed" category="transfer">
          <div v-if="transferWindow" class="warn" :class="{ good: transferWindow.open }">
            {{ transferWindow.open ? `Transfer window open${transferWindow.daysLeft !== null ? ` · ${transferWindow.daysLeft} days left` : ''}` : 'Transfer window closed' }}
          </div>
          <button v-if="isMyClub" class="btn primary" @click="openDoor('scouting')">Open my Transfers</button>
        </cozy-news>
      </cozy-drawer>

      <cozy-modal v-model="showAwaySummary" size="small">
        <h2><span v-html="icon('mail')"></span> {{ awayTitle }}</h2>
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
  type CampusBuilding, type CampusPlacement, type Matchday, type MatchdayFixture, type Placed, type TransferWindow, type WorldFeed,
} from '@repo/api-contract';
import { client, apiUrl } from '@/services/api';
import { sfx } from '@/services/sfx';
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
import CozyPresence from '@/components/cozy/cozy-presence.vue';
import { realtime } from '@/services/realtime';
import CozyPanel from '@/components/cozy/cozy-panel.vue';
import CozyModal from '@/components/cozy/cozy-modal.vue';
import CozyMatchmaking from '@/components/cozy/cozy-matchmaking.vue';
import CozyRewards from '@/components/cozy/cozy-rewards.vue';
import CozyDrawer from '@/components/cozy/cozy-drawer.vue';
import CozyNews from '@/components/cozy/cozy-news.vue';
import CozyLeague from '@/components/cozy/cozy-league.vue';
import CozySettings from '@/components/cozy/cozy-settings.vue';
import CozyMatchday from '@/components/cozy/cozy-matchday.vue';
import CozyMatchPrep from '@/components/cozy/cozy-match-prep.vue';
import UserCompetitions from '@/views/user/competitions/competitions.vue';
import TeamSheetZone from '@/views/user/club/zones/team-sheet-zone.vue';
import SquadZone from '@/views/user/club/zones/squad-zone.vue';
import TransferZone from '@/views/user/club/zones/transfer-zone.vue';
import OwnerZone from '@/views/user/club/zones/owner-zone.vue';
import PerformanceZone from '@/views/user/club/zones/performance-zone.vue';
import { useClubRefresh } from '@/composables/use-club-refresh';
import { clubColors } from '@/components/cozy/club-colors';
import { stageName } from '@/components/cozy/stages';
import { icon } from '@/components/cozy/icons';
import MatchzoneView from '@/components/matchzone/matchzone-view.vue';
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
// Another manager's club played ours while we're looking (async PvP).
function onDefended(p: { attackerName: string; score: string; outcome: 'win' | 'draw' | 'loss' }) {
  const text =
    p.outcome === 'win'
      ? `Your team saw off ${p.attackerName} ${p.score}!`
      : p.outcome === 'draw'
        ? `${p.attackerName} drew ${p.score} at your ground`
        : `${p.attackerName} won at your ground (${p.score})`;
  game.toast(text, p.outcome === 'loss' ? 'error' : 'success');
  void game.loadInbox();
  void game.load();
}
onMounted(() => {
  openPlay.start();
  realtime.on('club:defended', onDefended);
  realtime.on('news:item', onNewsItem);
});
onUnmounted(() => {
  openPlay.stop();
  realtime.off('club:defended', onDefended);
  realtime.off('news:item', onNewsItem);
  followPlaces(null);
});

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
  const today = !!upcoming && upcoming.scheduledDay === openPlay.settings?.currentDay;
  const lg = playState.value?.league?.next;
  // A challenge due today beats a league match further out; otherwise the league leads.
  let next: { opponent: string; home: boolean; day: number | null; inSeconds: number | null; soon: boolean; league: boolean; travel: boolean; planSet?: boolean | null } | null = null;
  const up = nextUp.value;
  if (up && !(upcoming && today)) {
    const inSeconds = up.startsInSeconds === null ? null : Math.max(0, up.startsInSeconds - matchdayElapsed.value);
    next = { opponent: up.opponent.name, home: up.home, day: up.day, inSeconds, soon: inSeconds !== null && inSeconds < 3600, league: false, travel: false, planSet: up.planSet };
  } else if (upcoming && (today || !lg)) {
    const home = upcoming.homeClubId === openPlay.clubId;
    next = { opponent: directory.name(opponentId), home, day: upcoming.scheduledDay ?? null, inSeconds: null, soon: today, league: false, travel: today && !home };
  } else if (lg) {
    const inSeconds = lg.startsInSeconds === null ? null : Math.max(0, lg.startsInSeconds - leagueElapsed.value);
    next = { opponent: lg.opponentName, home: lg.home, day: lg.day, inSeconds, soon: inSeconds !== null && inSeconds < 3600, league: true, travel: false };
  }
  return {
    day: cal ? `Day ${cal.CurrentDay}${cal.CurrentDate ? ` · ${new Date(cal.CurrentDate).toDateString()}` : ''}` : '…',
    year: openPlay.settings
      ? { currentYear: openPlay.settings.currentYear, dayOfYear: openPlay.settings.dayOfYear, yearLengthDays: openPlay.settings.yearLengthDays }
      : null,
    next,
    performance: isMyClub.value && openPlay.performance ? { score: openPlay.performance.score, expected: openPlay.performance.expected } : null,
    form: playState.value?.standing.form ?? [],
  };
});

// --- The league badge and drawer ---------------------------------------------------------
const leagueLoadedAt = ref(Date.now());
watch(playState, () => (leagueLoadedAt.value = Date.now()));
const leagueElapsed = computed(() => Math.max(0, Math.floor((game.now.value - leagueLoadedAt.value) / 1000)));
const leagueBadge = computed(() => {
  const l = playState.value?.league;
  if (!l) return null;
  const i = l.table.findIndex((r) => r.clubId === clubId.value);
  return { division: l.division, position: i >= 0 ? i + 1 : null, total: l.clubsInPool, poolName: l.poolName };
});
function openLeague(tab = 0) {
  selectedKey.value = null;
  drawerTab.value = tab;
  drawer.value = 'league';
  markStep('league');
}

// --- The club shop: the campus's gold mine (docs/CORE-LOOP.md) ----------------------------
const collector = computed(() =>
  // Shown once there's something worth a tap (a tenth of the till), like CoC's collectors.
  isMyClub.value && playState.value?.shop && game.shopPending.value >= playState.value.shop.cap * 0.1
    ? { key: 'stands', amount: game.shopPending.value, full: game.shopFull.value, coach: coach.value === 'collect' }
    : null
);

async function collect() {
  const from = campusRef.value?.screenOf('stands');
  const amount = await game.collectShop();
  if (!amount) return;
  sfx.play('collect');
  campusRef.value?.burst('stands', 'coins');
  flyCoins(from, amount);
  markStep('collect');
}

/** Coins arc from the Stands into the treasury chip, with a floating "+amount". */
function flyCoins(from: { x: number; y: number } | null | undefined, amount: number) {
  const root = rootEl.value;
  const target = root?.querySelector('[data-res="cash"]')?.getBoundingClientRect();
  if (!root || !target) return;
  const sx = from?.x ?? window.innerWidth / 2;
  const sy = (from?.y ?? window.innerHeight / 2) - 30;
  const tx = target.left + 18;
  const ty = target.top + target.height / 2;
  const n = Math.min(12, 4 + Math.floor(Math.log10(Math.max(amount, 10)) * 2));
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'coinfly';
    el.innerHTML = icon('coins');
    el.style.left = `${sx - 17}px`;
    el.style.top = `${sy - 17}px`;
    root.appendChild(el);
    const dx = (Math.random() - 0.5) * 140;
    const dy = -40 - Math.random() * 70;
    const anim = el.animate(
      [
        { transform: 'translate(0, 0) scale(.5)', opacity: 0 },
        { transform: `translate(${dx}px, ${dy}px) scale(1.1)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${tx - sx}px, ${ty - sy}px) scale(.6)`, opacity: 0.9 },
      ],
      { duration: 850 + i * 35, delay: i * 45, easing: 'cubic-bezier(.5, 0, .6, 1)', fill: 'forwards' }
    );
    anim.onfinish = () => {
      el.remove();
      if (i % 3 === 0) sfx.play('coin');
    };
  }
  const t = document.createElement('div');
  t.className = 'floattext';
  t.textContent = `+${currency(amount)}`;
  t.style.left = `${sx}px`;
  t.style.top = `${sy - 24}px`;
  t.style.transform = 'translate(-50%, -100%)';
  root.appendChild(t);
  setTimeout(() => t.remove(), 1500);
}

// --- Celebrations: finished builds and new Levels -----------------------------------------
watch(game.justBuilt, (keys) => {
  if (!keys.length) return;
  for (const k of keys) {
    campusRef.value?.burst(k, 'confetti');
    const a = game.campus.value?.assets.find((x) => x.type === k);
    toast(`${a?.name ?? 'Construction'} reached Tier ${a?.level ?? ''}!`);
  }
  sfx.play('complete');
  game.justBuilt.value = [];
});
/** A Level reached during a match is shown on the result screen instead. */
const rewardLevel = ref<number | null>(null);
watch(game.levelReached, (lv) => {
  if (lv === null) return;
  if (game.playing.value || game.showBattleArena.value || game.showRewards.value) rewardLevel.value = lv;
  else {
    sfx.play('levelup');
    campusRef.value?.burst('office', 'confetti');
    toast(`Level ${lv}! Your club is growing.`);
  }
  game.levelReached.value = null;
});
watch(game.showRewards, (open) => !open && (rewardLevel.value = null));

// --- Selection and panels ----------------------------------------------------------------
const selectedKey = ref<CampusBuilding | null>(null);
const tierOf = (type: string) => game.campus.value?.assets.find((a) => a.type === type)?.level ?? 0;
const selectedAsset = computed(() => game.campus.value?.assets.find((a) => a.type === selectedKey.value) ?? null);
const medicalAsset = computed(() => game.campus.value?.assets.find((a) => a.type === 'medical_centre') ?? null);
const showBuild = ref(false);
const showTreatment = ref(false);
const showSettings = ref(false);
watch([showBuild, showSettings, game.showMatchmaking], (now, before) => {
  if (now.some((on, i) => on && !before?.[i])) sfx.play('open');
});

function onTap(pick: Pick, ground: { x: number; z: number } | null) {
  if (moving.value) {
    if (pick?.kind === 'building' && pick.id !== moving.value.key) return startMove(pick.id as CampusBuilding);
    if (ground) placeGhost(ground);
    return;
  }
  if (pick?.kind === 'building') {
    selectedKey.value = pick.id as CampusBuilding;
    sfx.play('tap');
  }
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

// --- The Manager hub: every management screen in one drawer over the campus ------------------
// Buildings are shortcuts into it (docs/CORE-LOOP.md, "One shell").
type HubKey = 'matchday' | 'team' | 'squad' | 'transfers' | 'club' | 'analysis';
interface HubTab { key: HubKey; title: string; component?: Component; readOnly?: boolean }
const HUB_TABS: HubTab[] = [
  { key: 'matchday', title: 'Matchday' },
  { key: 'team', title: 'Team sheet', component: TeamSheetZone, readOnly: true },
  { key: 'squad', title: 'Squad', component: SquadZone },
  { key: 'transfers', title: 'Transfers', component: TransferZone },
  { key: 'club', title: 'Club', component: OwnerZone, readOnly: true },
  { key: 'analysis', title: 'Analysis', component: PerformanceZone },
];
const BUILDING_TAB: Partial<Record<CampusBuilding, HubKey>> = {
  dugout: 'matchday',
  training_ground: 'squad',
  scouting: 'transfers',
  office: 'club',
};
/** Visitors only see the screens that have a read-only mode. */
const hubTabs = computed(() => (isMyClub.value ? HUB_TABS : HUB_TABS.filter((t) => t.readOnly)));
const tabFor = (key: CampusBuilding | null): HubKey | null => {
  const tab = key ? BUILDING_TAB[key] : undefined;
  if (!tab) return null;
  if (!isMyClub.value && tab === 'matchday') return 'team';
  return hubTabs.value.some((t) => t.key === tab) ? tab : null;
};

/** The building panel's door button. */
function doorFor(key: CampusBuilding | null): { label: string } | null {
  const tab = tabFor(key);
  if (!tab) return null;
  return { label: tab === 'matchday' ? 'Match day' : (HUB_TABS.find((t) => t.key === tab)?.title ?? '') };
}

const drawer = ref<'hub' | 'prep' | 'news' | 'billboard' | 'league' | null>(null);
const drawerTab = ref(0);
const hubTab = computed(() => (drawer.value === 'hub' ? (hubTabs.value[drawerTab.value] ?? null) : null));
const drawerTitle = computed(() =>
  drawer.value === 'news'
    ? 'Around the world'
    : drawer.value === 'billboard'
      ? 'Transfer highlights'
      : drawer.value === 'league'
        ? 'League'
        : drawer.value === 'prep'
          ? 'Match prep'
          : isMyClub.value
            ? 'Manager'
            : (club.value?.Name ?? '')
);
// Sounds for panels opening and closing.
watch(drawer, (now, before) => (now && !before ? sfx.play('open') : !now && before ? sfx.play('close') : undefined));

function openHub(key: HubKey) {
  const i = hubTabs.value.findIndex((t) => t.key === key);
  if (i < 0) return;
  selectedKey.value = null;
  drawerTab.value = i;
  drawer.value = 'hub';
}

function openDoor(key: CampusBuilding) {
  const tab = tabFor(key);
  if (tab) openHub(tab);
}

function closeDrawer() {
  drawer.value = null;
  loadOffers();
}

// --- Match day: booking, prep and watching (docs/CORE-LOOP.md, "Match day") ------------------
const matchday = ref<Matchday | null>(null);
const matchdayLoadedAt = ref(Date.now());
const matchdayKey = ref(0);
const matchdayElapsed = computed(() => Math.max(0, Math.floor((game.now.value - matchdayLoadedAt.value) / 1000)));
async function loadMatchday() {
  if (!isMyClub.value || !clubId.value) return;
  const res = await client.play.getMatchday.query({ params: { clubId: clubId.value } });
  if (res.status === 200) {
    matchday.value = res.body.payload;
    matchdayLoadedAt.value = Date.now();
  }
}
watch([isMyClub, matchdayKey], () => loadMatchday(), { immediate: true });
const nextUp = computed<MatchdayFixture | null>(() => matchday.value?.upcoming[0] ?? null);

/** A scheduled match counts as live while its broadcast would still be running at 1x. */
const LIVE_WINDOW_MS = 5 * 60_000;
const liveMatch = computed(
  () =>
    matchday.value?.recent.find((f) => f.hasReplay && f.playedAt && game.now.value - Date.parse(f.playedAt) < LIVE_WINDOW_MS) ?? null
);
// Kick-off on campus: the visitors' bus pulls in, the whistle goes.
const announcedLive = new Set<string>();
watch(liveMatch, async (m) => {
  if (!m || announcedLive.has(m.fixtureId)) return;
  announcedLive.add(m.fixtureId);
  sfx.play('whistle');
  toast(`Kick-off! ${m.home ? `${m.opponent.name} are at your ground` : `You're at ${m.opponent.name}`}. Watch it live.`);
  if (m.home && !watching.value && !matchOpen.value) await campusRef.value?.playArrival(await clubColors(m.opponent.code));
});

const prepFixtureId = ref<string | null>(null);
function openPrep(fixtureId: string) {
  prepFixtureId.value = fixtureId;
  selectedKey.value = null;
  drawer.value = 'prep';
}
function onPlanSaved() {
  matchdayKey.value++;
  markStep('prep');
}

function startBooking() {
  drawer.value = null;
  game.findMatch(false, true);
}
async function onBook(o: { id: string }) {
  const f = await game.bookMatch(o.id);
  if (!f) return;
  matchdayKey.value++;
  openPrep(f.fixtureId);
}

const watching = ref<{ fixtureId: string; liveFromMs: number | null } | null>(null);
function watchFixture(fixtureId: string, playedAt: string | null) {
  const since = playedAt ? Date.now() - Date.parse(playedAt) : Infinity;
  drawer.value = null;
  watching.value = { fixtureId, liveFromMs: since < LIVE_WINDOW_MS ? since : null };
}
function closeWatching() {
  watching.value = null;
  matchdayKey.value++;
  game.load();
}

const refreshClub = useClubRefresh();
async function onZoneUpdate() {
  await refreshClub(clubId.value);
  game.load();
}

/** The Analysis screen links to the old dashboard's tabs by index (dashboard.vue). */
function onZoneSwitchTab(tab: number) {
  const byTab: Record<number, HubKey> = { 1: 'team', 2: 'squad', 4: 'club', 5: 'transfers' };
  if (byTab[tab]) openHub(byTab[tab]);
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
  const res = await client.calendar.getWorldFeed.query({ query: { clubId: clubId.value } });
  if (res.status === 200) {
    worldFeed.value = res.body.payload;
    followPlaces(res.body.payload.local);
  }
}

// Local news arrives live on the club's town, region and country topics
// (docs/WORLD-PYRAMID-SPEC.md, "News scopes"); the world's biggest stories
// come on the world topic the open-play store already follows.
let placeTopics: string[] = [];
function followPlaces(local: WorldFeed['local'] | null | undefined) {
  const next = local
    ? [local.townId && `town:${local.townId}`, local.regionId && `region:${local.regionId}`, local.countryId && `country:${local.countryId}`].filter(
        (t): t is string => !!t
      )
    : [];
  for (const t of placeTopics) if (!next.includes(t)) realtime.leave(t);
  for (const t of next) if (!placeTopics.includes(t)) realtime.join(t);
  placeTopics = next;
}
function onNewsItem(item: { storyId: string; scope: string; kind: string; title: string; body: string; day: number; fixtureId: string | null }) {
  const feed = worldFeed.value;
  if (!feed || feed.headlines.some((h) => h.id === `news-${item.storyId}`)) return;
  const tag = { town: 'TOWN', region: 'REGION', country: 'NATIONAL', world: 'WORLD' }[item.scope] ?? 'NEWS';
  const category: WorldFeed['headlines'][number]['category'] =
    item.kind === 'transfer' ? 'transfer' : ['founded', 'title', 'promotion', 'relegation'].includes(item.kind) ? 'milestone' : 'result';
  feed.headlines = [
    {
      id: `news-${item.storyId}`,
      category,
      title: item.title,
      summary: item.body,
      timestamp: `Day ${item.day}`,
      tag,
      ...(item.fixtureId ? { relatedFixtureId: item.fixtureId } : {}),
    },
    ...feed.headlines,
  ].slice(0, 40);
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
  if (!matchOpen.value && !game.playing.value) game.load();
  loadMatchday();
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

/** The match just played, watched in the Matchzone over the campus. */
const matchOpen = computed(() => game.showBattleArena.value && !!game.matchResult.value?.fixtureId);
watch(game.showBattleArena, (open) => {
  // No replay to show (shouldn't happen when watching): straight to the spoils.
  if (open && !game.matchResult.value?.fixtureId) game.finishBattle();
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
    case 'collect':
      if (game.shopPending.value >= 1) return collect();
      return focusOn('stands');
    case 'inbox': return (showInbox.value = true);
    case 'challenge': return (showChallenge.value = true);
    case 'league': return openLeague(0);
    case 'competitions': return openLeague(1);
    case 'world': return router.push('/world');
    case 'home': return router.push(openPlay.clubId ? `/game/${openPlay.clubId}` : '/u');
    case 'travel': return travel();
    case 'squad': return openHub('squad');
    case 'tactics': return openHub('team');
    case 'transfers': return openHub('transfers');
    case 'analysis': return openHub('analysis');
    case 'manager':
    case 'matchday': return openHub('matchday');
    case 'office':
    case 'club': return openHub('club');
    case 'prep':
    case 'next': return nextUp.value ? openPrep(nextUp.value.fixtureId) : openHub('matchday');
    case 'watch-live': return liveMatch.value && watchFixture(liveMatch.value.fixtureId, liveMatch.value.playedAt);
    case 'book': return startBooking();
    case 'news': return openPlace('newsstand');
    case 'settings': return (showSettings.value = true);
    default: return goManager(action);
  }
}

function focusOn(key: CampusBuilding) {
  const p = view.value?.placement[key];
  if (!p) return;
  const [w, d] = footprint(key, p.rot);
  campusRef.value?.focus((p.x + w / 2) * CELL, (p.z + d / 2) * CELL);
}

function onSettingsAct(action: string) {
  showSettings.value = false;
  if (action === 'office') openHub('matchday');
  else if (action === 'calendar') router.push('/u/calendar');
  else if (action === 'account') router.push('/u/settings');
  else if (action === 'logout') logout();
}

async function logout() {
  try {
    await client.users.logoutUser.mutation({ params: { id: (store.user as { userID?: string })?.userID ?? '' }, body: {} });
  } catch (err) {
    console.warn('Logout request failed', err);
  }
  realtime.disconnect();
  store.unsetUser();
  if (import.meta.env.VITE_IMAGINATION_LOGIN === 'true') {
    window.location.assign(`${apiUrl}/api/auth/logout`);
    return;
  }
  router.push('/auth');
}

// Deep links from other screens: /game/:id?open=league|office|squad|tactics|transfers|settings|build
watch(
  () => !!game.campus.value && !!club.value && !!route.query.open,
  (ready) => {
    if (!ready) return;
    const what = String(route.query.open);
    router.replace({ query: { ...route.query, open: undefined } });
    onAct(what);
  },
  { immediate: true }
);

// --- First steps for a young club ----------------------------------------------------------------
/** One-off onboarding steps done on this device, per club. */
const stepFlags = ref<Record<string, boolean>>({});
watch(
  clubId,
  (id) => {
    try {
      stepFlags.value = JSON.parse(localStorage.getItem(`fspro_steps_${id}`) || '{}');
    } catch {
      stepFlags.value = {};
    }
  },
  { immediate: true }
);
function markStep(key: string) {
  if (stepFlags.value[key]) return;
  stepFlags.value = { ...stepFlags.value, [key]: true };
  try {
    localStorage.setItem(`fspro_steps_${clubId.value}`, JSON.stringify(stepFlags.value));
  } catch {
    // Private mode: the step just stays open.
  }
}

const firstSteps = computed(() => {
  if (!isMyClub.value || (playState.value?.club.level ?? 0) > 2) return null;
  const assets = game.campus.value?.assets ?? [];
  const steps = [
    { key: 'collect', label: 'Collect your shop takings', hint: 'Tap the coins over your Stands', icon: 'coins', done: !!stepFlags.value.collect },
    { key: 'play', label: 'Play your first match', hint: 'Press PLAY: you meet a club of your level', icon: 'ball', done: (playState.value?.recent.length ?? 0) > 0 },
    {
      key: 'prep',
      label: 'Plan your next match',
      hint: 'Tap your next match: pick the XI, the style and half-time orders',
      icon: 'bag',
      done: !!stepFlags.value.prep || !!matchday.value?.upcoming.some((f) => f.planSet) || (!!matchday.value && !nextUp.value),
    },
    { key: 'build', label: 'Build a facility', hint: 'Stands earn gate money; a pitch helps at home', icon: 'hammer', done: assets.some((a) => a.level > 0 || !!a.upgrade) },
    { key: 'league', label: 'Check your league', hint: 'Your division, the table and your next fixture', icon: 'trophy', done: !!stepFlags.value.league || !playState.value?.league },
  ];
  return steps.every((s) => s.done) ? null : steps;
});
/** Where the onboarding pointer sits: the first step not done yet. */
const coach = computed(() => firstSteps.value?.find((s) => !s.done)?.key ?? null);

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
  openHub('team');
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
const awayTitle = ref('While you were away');
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
  // Scheduled matches that played while we were gone, with their scores.
  const since = rawLastSeen ? Number(rawLastSeen) : nowTime;
  for (const f of matchday.value?.recent ?? []) {
    if (!f.playedAt || Date.parse(f.playedAt) <= since || !f.score) continue;
    const res = f.score.you > f.score.them ? 'Won' : f.score.you < f.score.them ? 'Lost' : 'Drew';
    events.unshift({
      icon: f.score.you > f.score.them ? '🏆' : '🏟️',
      title: `${res} ${f.score.you}-${f.score.them} ${f.home ? 'vs' : 'at'} ${f.opponent.name}`,
      description: `${{ league: 'League', booked: 'Booked match', challenge: 'Challenge', cup: 'Cup', friendly: 'Friendly' }[f.kind]}, day ${f.day}.${f.hasReplay ? ' Watch it in Manager › Matchday.' : ''}`,
    });
  }
  const away = rawLastSeen ? (nowTime - Number(rawLastSeen)) / 1000 : 0;
  // A club's very first visit (just founded, or a new device) is a welcome.
  const firstVisit = !rawLastSeen;
  awayTitle.value = firstVisit ? `Welcome to ${club.value?.Name ?? 'your club'}` : 'While you were away';
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
  if (game.cooldownLeft.value === 0 && !firstVisit) events.push({ icon: '⚡', title: 'Squad rested', description: 'The players are ready to play.' });
  awayEvents.value = events;
  showAwaySummary.value = events.length > 0;
}

let checkedOffline = false;
watch(
  () => game.campus.value,
  async (loaded) => {
    if (!loaded || checkedOffline || !isMyClub.value) return;
    checkedOffline = true;
    await Promise.all([game.loadInbox(), loadMatchday()]);
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
