<template>
  <div ref="rootEl" class="cozy">
    <div
      v-if="clubQuery.isLoading.value || !game.campus.value"
      class="cg-state"
    >
      Loading the grounds…
    </div>
    <div v-else-if="clubQuery.isError.value || !club" class="cg-state">
      <p>Could not load this club.</p>
      <router-link class="btn" to="/start">Back</router-link>
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

      <cozy-presence
        v-if="clubId"
        :club-id="clubId"
        :club-name="club.Name"
        :is-mine="isMyClub"
        @notify="(t: string) => game.toast(t)"
      />

      <cozy-hud
        :club="{ name: club.Name, code: club.ClubCode }"
        :tier="eco?.clubhouse.tier ?? 1"
        :standing="eco?.standingPoints ?? 0"
        :res="{
          cash: eco?.cash ?? 0,
          fans: eco?.fans ?? 0,
          tokens: eco?.scoutTokens ?? 0,
        }"
        :caps="caps"
        :builders="builders"
        :guard-seconds="guardSeconds"
        :defences="newDefences"
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
        :budget="eco?.cash ?? 0"
        :busy="game.upgradingAsset.value !== null"
        :now-ms="game.now.value"
        :door="doorFor(selectedKey)"
        :alert="alerts[selectedKey]?.label ?? null"
        :club-level="eco?.clubhouse.tier ?? 0"
        :staff-tier="tierOf('staff_house')"
        @close="selectedKey = null"
        @upgrade="game.startUpgrade"
        @move="startMove"
        @open="onOpen"
      />

      <cozy-modal v-model="showBuild" size="wide">
        <h2>
          <span v-html="icon('hammer')"></span>
          Build
        </h2>
        <p class="sub">
          {{ builders?.active ?? 0 }}/{{ builders?.max ?? 0 }} builders busy
        </p>
        <div class="cards">
          <button
            v-for="a in game.campus.value.assets"
            :key="a.type"
            class="card"
            :class="{ off: !!a.next?.blockedReason && !a.upgrade }"
            @click="pickFromMenu(a.type)"
          >
            <div class="card-title">
              {{
                stageName(a.type as CampusBuilding, {
                  tier: a.level,
                  clubLevel: 0,
                  staffTier: 0,
                })
              }}
            </div>
            <div class="card-art" :class="`art-${a.type}`"></div>
            <div class="card-desc">
              {{ a.name }} · Tier {{ a.level }} · {{ a.effectLabel }}
            </div>
            <div v-if="a.upgrade" class="card-meta">
              Building Tier {{ a.upgrade.toLevel }}…
            </div>
            <div v-else-if="a.next" class="chips">
              <span class="chip">
                <span v-html="icon('coins')"></span>
                {{ currency(a.next.cost) }}
              </span>
            </div>
            <div v-if="a.next?.blockedReason && !a.upgrade" class="card-why">
              {{ a.next.blockedReason }}
            </div>
          </button>
        </div>
        <div class="row-btns">
          <button class="btn" @click="(showBuild = false), (showCampus = true)">
            <span v-html="icon('coins')"></span> Clubhouse, collectors &amp; vaults
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
          :squad-issue="squadIssue"
          :cooldown="game.cooldownLeft.value"
          @select="game.selectOpponent"
          @play="kickOff"
          @scout="onScout"
          @squad="(game.showMatchmaking.value = false), openSquad('grid')"
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
        @close="closeWatching"
      />

      <cozy-modal v-model="game.showRewards.value">
        <cozy-rewards
          v-if="game.matchResult.value && game.showRewards.value"
          :result="game.matchResult.value"
          :my-name="club.Name"
          :my-code="club.ClubCode"
          :cooldown="game.cooldownLeft.value"
          @close="game.showRewards.value = false"
          @again="((game.showRewards.value = false), game.findMatch(quickSim))"
        />
      </cozy-modal>

      <cozy-modal v-model="showSettings" size="small">
        <cozy-settings
          v-model:quick-sim="quickSim"
          :user-name="store.user?.fullname ?? store.user?.username"
          @act="onSettingsAct"
        />
      </cozy-modal>

      <!-- Clubhouse, collectors, builders and vaults (docs/coc-mapping/08 §4.1). -->
      <cozy-modal v-model="showCampus" size="wide" label="Grounds">
        <campus-economy
          v-if="isMyClub"
          :club-id="clubId"
          @toast="toast"
          @changed="game.load()"
        />
      </cozy-modal>

      <!-- The club hub: defence log + replay, ladder, season, legacy,
           abilities/War Room, association, Pre-Season (08 §6). -->
      <cozy-modal v-model="showHub" size="wide" label="Club hub">
        <club-hub
          v-if="isMyClub && showHub"
          :club-id="clubId"
          :initial="hubTab as any"
          :server-now="eco?.now ?? null"
          @toast="toast"
          @replay="onHubReplay"
        />
      </cozy-modal>

      <!-- The squad: the Pitch Grid (your formation, home and away) and the roster. -->
      <cozy-drawer
        :model-value="squadOpen"
        :title="isMyClub ? 'Squad' : club.Name"
        :tabs="squadTabs.map((t) => t.title)"
        :tab="squadTab"
        @update:model-value="(open: boolean) => !open && (squadOpen = false)"
        @update:tab="(i: number) => (squadTab = i)"
      >
        <pitch-grid-editor
          v-if="squadOpen && squadTabs[squadTab]?.key === 'grid'"
          :club-id="clubId"
          :club="club"
          :mode="isMyClub ? 'edit' : 'scout'"
          @toast="toast"
        />
        <squad-zone
          v-else-if="squadOpen && squadTabs[squadTab]?.key === 'roster'"
          :club="club"
          @update-available="onSquadUpdate"
        />
      </cozy-drawer>

      <div class="toasts">
        <div
          v-if="game.snackbar.value"
          class="toast"
          :class="game.snackbarColor.value === 'error' ? 'bad' : 'good'"
        >
          {{ game.snackbarText.value }}
        </div>
      </div>

      <facility-detail-sheet
        v-model="showTreatment"
        :club-id="clubId"
        :asset="medicalAsset"
        icon="➕"
        :read-only="!isMyClub"
        :upgrading="game.upgradingAsset.value !== null"
        :now-ms="game.now.value"
        :budget="eco?.cash ?? null"
        @upgrade="game.startUpgrade"
        @treated="onSquadUpdate"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import '@/components/cozy/cozy.scss';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import {
  CAMPUS_GRID,
  footprint,
  validatePlacement,
  type CampusBuilding,
  type CampusPlacement,
  type Placed,
} from '@repo/api-contract';
import { client, apiUrl } from '@/services/api';
import { sfx } from '@/services/sfx';
import { useStore } from '@/store';
import { useClubGame } from '@/composables/use-club-game';
import { currency } from '@/helpers/misc';
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
import CozySettings from '@/components/cozy/cozy-settings.vue';
import CampusEconomy from '@/components/cozy/campus-economy.vue';
import ClubHub from '@/components/cozy/club-hub.vue';
import PitchGridEditor from '@/components/cozy/grid/pitch-grid-editor.vue';
import SquadZone from '@/views/user/club/zones/squad-zone.vue';
import { useClubRefresh } from '@/composables/use-club-refresh';
import { clubColors } from '@/components/cozy/club-colors';
import { stageName } from '@/components/cozy/stages';
import { icon } from '@/components/cozy/icons';
import MatchzoneView from '@/components/matchzone/matchzone-view.vue';
import { CELL } from '@/components/cozy/scene/models';
import { renderThumbs } from '@/components/cozy/scene/thumbs';
import type { CityVariant } from '@/components/cozy/scene/terrain';
import type { Pick } from '@/components/cozy/scene/world';

/**
 * The campus: the whole game for launch (docs/coc-mapping/README §1).
 * Collect -> Build -> set your grid -> Attack -> stars, loot, standing ->
 * get attacked while away. Everything else lives in the club hub overlay.
 */

const route = useRoute();
const router = useRouter();
const store = useStore();

if (!store.isAuthenticated) store.getUser();

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
const eco = computed(() => game.economy.value);
const rootEl = ref<HTMLElement | null>(null);
const campusRef = ref<InstanceType<typeof CozyCampus> | null>(null);

const isMyClub = computed(() => {
  const id = club.value?._id;
  const owned = store.user?.clubs;
  if (!id || !Array.isArray(owned)) return false;
  return owned.some((c: any) => (typeof c === 'string' ? c : c._id) === id);
});

// --- Resources, vaults, builders, guard ----------------------------------------------
const caps = computed(() => {
  const cap = (c: string) =>
    eco.value?.vaults.find((v) => v.currency === c)?.capacity ?? null;
  return { cash: cap('cash'), fans: cap('fans'), tokens: cap('scout_tokens') };
});

const builders = computed(() => {
  const campus = game.campus.value;
  if (!campus) return null;
  const next = campus.assets
    .filter((a) => a.upgrade)
    .sort((a, b) => a.upgrade!.completeAt.localeCompare(b.upgrade!.completeAt))[0];
  return {
    active: eco.value?.groundskeepers.active ?? campus.activeUpgrades,
    max: eco.value?.groundskeepers.count ?? campus.maxConcurrentUpgrades,
    next: next
      ? {
          name: next.name,
          secondsLeft: Math.max(
            0,
            Math.ceil((Date.parse(next.upgrade!.completeAt) - game.now.value) / 1000)
          ),
        }
      : null,
  };
});

const guardSeconds = computed(() => {
  const until = eco.value?.guardUntil;
  return until ? Math.max(0, Math.ceil((Date.parse(until) - game.now.value) / 1000)) : 0;
});

// --- Defence log: raids against us since the viewer last looked ----------------------
const seenKey = computed(() => `fspro_defences_seen_${clubId.value}`);
const defencesSeenAt = ref(0);
watch(
  clubId,
  () => {
    try {
      defencesSeenAt.value = Number(localStorage.getItem(seenKey.value) ?? 0);
    } catch {
      defencesSeenAt.value = 0;
    }
  },
  { immediate: true }
);
const newDefences = computed(
  () =>
    game.defences.value.filter((d) => Date.parse(d.resolvedAt) > defencesSeenAt.value)
      .length
);
function markDefencesSeen() {
  defencesSeenAt.value = Date.now();
  try {
    localStorage.setItem(seenKey.value, String(defencesSeenAt.value));
  } catch {
    /* private window: the badge just resets next visit */
  }
}

/** Raided while away: say so once, and offer the log. */
let announcedAway = false;
watch(
  () => [isMyClub.value, game.defences.value.length] as const,
  ([mine]) => {
    if (!mine || announcedAway || !newDefences.value) return;
    announcedAway = true;
    const lost = game.defences.value.filter(
      (d) => Date.parse(d.resolvedAt) > defencesSeenAt.value && d.outcome === 'win'
    ).length;
    toast(
      `You were attacked ${newDefences.value} time${newDefences.value > 1 ? 's' : ''} while away${lost ? ` (${lost} lost)` : ''}. Check the defence log.`,
      lost ? 'error' : 'success'
    );
  }
);
watch(isMyClub, (mine) => mine && game.loadDefences(), { immediate: true });

// Another manager attacked us while we're looking (async PvP).
function onDefended(p: { attackerName: string; score: string; outcome: 'win' | 'draw' | 'loss' }) {
  const text =
    p.outcome === 'win'
      ? `Your grid held: ${p.attackerName} beaten ${p.score}!`
      : p.outcome === 'draw'
        ? `${p.attackerName} drew ${p.score} at your ground`
        : `${p.attackerName} raided your ground (${p.score})`;
  toast(text, p.outcome === 'loss' ? 'error' : 'success');
  void game.loadDefences();
  void game.load();
}
onMounted(() => realtime.on('club:defended', onDefended));
onUnmounted(() => realtime.off('club:defended', onDefended));

// --- The 3D campus ----------------------------------------------------------------------
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

const variant = computed(
  () => ((club.value as any)?.CampusLayout ?? 'city') as CityVariant
);

const view = computed(() => {
  const campus = game.campus.value;
  if (!campus) return null;
  const tiers = Object.fromEntries(
    campus.assets.map((a) => [a.type, { tier: a.level, upgrading: !!a.upgrade }])
  );
  const players = ((club.value as any)?.Players ?? []).map((p: any) => ({
    id: String(p._id),
    name: `${p.FirstName ?? ''} ${p.LastName ?? ''}`.trim(),
    injured: Number(p.Injury?.daysRemaining) > 0,
  }));
  return {
    tiers,
    placement: draft.value ?? (campus.placement as CampusPlacement),
    players,
    fans: eco.value?.fans ?? 0,
    matchDay: false,
    clubLevel: eco.value?.clubhouse.tier ?? 0,
    colors: colors.value,
  };
});

const timers = computed(() =>
  Object.fromEntries(
    (game.campus.value?.assets ?? [])
      .filter((a) => a.upgrade)
      .map((a) => [
        a.type,
        {
          start: new Date(a.upgrade!.startAt).getTime(),
          end: new Date(a.upgrade!.completeAt).getTime(),
        },
      ])
  )
);

// --- Collecting: the collectors' takings, tapped on the grounds -------------------------------
const collector = computed(() => {
  if (!isMyClub.value || !eco.value) return null;
  const { cash } = game.pendingByCurrency.value;
  const cap = eco.value.collectors
    .filter((c) => c.currency === 'cash')
    .reduce((n, c) => n + c.capacity, 0);
  // Shown once there's something worth a tap (a tenth of capacity), like CoC.
  if (!cap || cash < cap * 0.1) return null;
  return { key: 'stands', amount: cash, full: game.collectorsFull.value };
});

async function collect() {
  const from = campusRef.value?.screenOf('stands');
  const got = await game.collectAll();
  if (!got || (!got.cash && !got.fans)) return;
  sfx.play('collect');
  campusRef.value?.burst('stands', 'coins');
  if (got.cash) flyCoins(from, got.cash);
  if (got.fans) toast(`+${got.fans.toLocaleString('en-US')} fans`);
}

/** Coins arc from the collector into the cash chip, with a floating "+amount". */
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

// --- Celebrations: finished builds ----------------------------------------------------------
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

// --- Selection and panels ----------------------------------------------------------------
const selectedKey = ref<CampusBuilding | null>(null);
const tierOf = (type: string) =>
  game.campus.value?.assets.find((a) => a.type === type)?.level ?? 0;
const selectedAsset = computed(
  () => game.campus.value?.assets.find((a) => a.type === selectedKey.value) ?? null
);
const medicalAsset = computed(
  () => game.campus.value?.assets.find((a) => a.type === 'medical_centre') ?? null
);
const showBuild = ref(false);
const showTreatment = ref(false);
const showSettings = ref(false);
const showCampus = ref(false);
const showHub = ref(false);
const hubTab = ref('defence');
watch([showBuild, showSettings, showCampus, showHub, game.showMatchmaking], (now, before) => {
  if (now.some((on, i) => on && !before?.[i])) sfx.play('open');
});

function onTap(pick: Pick, ground: { x: number; z: number } | null) {
  if (moving.value) {
    if (pick?.kind === 'building' && pick.id !== moving.value.key)
      return startMove(pick.id as CampusBuilding);
    if (ground) placeGhost(ground);
    return;
  }
  if (pick?.kind === 'building') {
    selectedKey.value = pick.id as CampusBuilding;
    sfx.play('tap');
  } else if (pick?.kind === 'player') {
    const p = ((club.value as any)?.Players ?? []).find(
      (x: any) => String(x._id) === pick.id
    );
    if (p)
      toast(`${p.FirstName} ${p.LastName} · ${p.Position ?? ''} · ★${Math.round(p.Rating ?? 0)}`);
  } else selectedKey.value = null;
}

function pickFromMenu(key: string) {
  showBuild.value = false;
  selectedKey.value = key as CampusBuilding;
  focusOn(key as CampusBuilding);
}

/** Buildings that open a screen: the squad lives at the training ground and academy. */
const BUILDING_DOOR: Partial<Record<CampusBuilding, { label: string; open: () => void }>> = {
  training_ground: { label: 'Squad', open: () => openSquad('roster') },
  youth_academy: { label: 'Academy', open: () => openSquad('roster') },
  dugout: { label: 'Pitch grid', open: () => openSquad('grid') },
  office: { label: 'Club hub', open: () => openHub('ladder') },
};
function doorFor(key: CampusBuilding | null): string | null {
  if (!key || !isMyClub.value) return key === 'dugout' ? 'Pitch grid' : null;
  return BUILDING_DOOR[key]?.label ?? null;
}

function onOpen(what: string) {
  if (what === 'treatment') showTreatment.value = true;
  else if (what === 'grounds') showCampus.value = true;
  else if (what === 'door' && selectedKey.value) {
    const door = BUILDING_DOOR[selectedKey.value];
    selectedKey.value = null;
    door?.open();
  }
}

function openHub(tab = 'defence') {
  selectedKey.value = null;
  hubTab.value = tab;
  showHub.value = true;
  if (tab === 'defence') markDefencesSeen();
}

// --- The squad drawer: grid + roster -----------------------------------------------------
const squadOpen = ref(false);
const squadTab = ref(0);
const squadTabs = computed(() =>
  isMyClub.value
    ? [
        { key: 'grid', title: 'Pitch grid' },
        { key: 'roster', title: 'Players' },
      ]
    : [{ key: 'grid', title: 'Pitch grid' }]
);
function openSquad(tab: 'grid' | 'roster' = 'grid') {
  selectedKey.value = null;
  squadTab.value = Math.max(0, squadTabs.value.findIndex((t) => t.key === tab));
  squadOpen.value = true;
}
watch(squadOpen, (open, was) => (open && !was ? sfx.play('open') : !open && was ? sfx.play('close') : undefined));

const refreshClub = useClubRefresh();
async function onSquadUpdate() {
  await refreshClub(clubId.value);
  await clubQuery.refetch();
  game.load();
}

/** Why the squad may struggle in an attack; the engine still fills gaps. */
const squadIssue = computed(() => {
  const players: any[] = ((club.value as any)?.Players ?? []).filter((p: any) => p.isSigned !== false);
  const fit = players.filter((p) => !(Number(p.Injury?.daysRemaining) > 0)).length;
  if (fit < 11) return `Only ${fit} fit players. Promote youth from your Academy to fill the XI.`;
  return null;
});

// --- Alerts on buildings -----------------------------------------------------------------
const alerts = computed(() => {
  const out: Record<string, { icon: string; label: string; count?: number }> = {};
  if (!isMyClub.value) return out;
  const injured = view.value?.players.filter((p: { injured: boolean }) => p.injured).length ?? 0;
  if (injured)
    out.medical_centre = {
      icon: 'cross',
      count: injured,
      label: `${injured} player${injured > 1 ? 's' : ''} injured`,
    };
  if (squadIssue.value) out.youth_academy = { icon: 'alert', label: squadIssue.value };
  return out;
});

function onAlert(key: string) {
  selectedKey.value = key as CampusBuilding;
}

// Refresh the campus and the defence log every minute.
const refreshTimer = setInterval(() => {
  if (!matchOpen.value && !game.playing.value) game.load();
  if (isMyClub.value) game.loadDefences();
}, 60_000);
onUnmounted(() => clearInterval(refreshTimer));

// --- Move mode -------------------------------------------------------------------------
const draft = ref<CampusPlacement | null>(null);
const moving = ref<{ key: CampusBuilding | null } | null>(null);
const ghost = computed(() => {
  const key = moving.value?.key;
  if (!key || !draft.value) return null;
  return { key, at: draft.value[key], valid: !validatePlacement(draft.value) };
});

function startMove(key?: CampusBuilding) {
  if (!draft.value)
    draft.value = JSON.parse(JSON.stringify(game.campus.value!.placement)) as CampusPlacement;
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
  if (
    x < CAMPUS_GRID.minX ||
    z < CAMPUS_GRID.minZ ||
    x + w - 1 > CAMPUS_GRID.maxX ||
    z + d - 1 > CAMPUS_GRID.maxZ
  )
    return;
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
    if (problem)
      return toast(
        problem.replace(
          /^\w+/,
          (k) => game.campus.value?.assets.find((a) => a.type === k)?.name ?? k
        ),
        'error'
      );
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

// --- Attacking ---------------------------------------------------------------------------
const quickSim = ref(readQuickSim());
function readQuickSim() {
  try {
    return localStorage.getItem('fspro_play_mode') === 'quick_sim';
  } catch {
    return false;
  }
}
watch(quickSim, (q) => {
  try {
    localStorage.setItem('fspro_play_mode', q ? 'quick_sim' : 'battle');
  } catch {
    /* not remembered in a private window */
  }
});
const busArriving = ref(false);

/** The visitors' bus pulls up, then the match is played. */
async function kickOff() {
  const opp = game.matchedOpponent.value;
  if (!opp) return;
  if (!quickSim.value) {
    game.showMatchmaking.value = false;
    busArriving.value = true;
    await campusRef.value?.playArrival(await clubColors(opp.code ?? ''));
    busArriving.value = false;
  }
  await game.startBattle(quickSim.value);
}

/** The "Scout setup" link: the read-only scout screen for that opponent. */
function onScout(o: { id: string }) {
  game.showMatchmaking.value = false;
  selectedKey.value = null;
  router.push(`/game/${clubId.value}/scout/${o.id}`);
}

const matchOpen = computed(
  () => game.showBattleArena.value && !!game.matchResult.value?.fixtureId
);
watch(game.showBattleArena, (open) => {
  // No replay to show (shouldn't happen when watching): straight to the spoils.
  if (open && !game.matchResult.value?.fixtureId) game.finishBattle();
});

/** A defence-log replay, watched in the Matchzone over the campus. */
const watching = ref<{ fixtureId: string } | null>(null);
function onHubReplay(fixtureId: string) {
  showHub.value = false;
  watching.value = { fixtureId };
}
function closeWatching() {
  watching.value = null;
  game.load();
}

// --- HUD actions -------------------------------------------------------------------------
function onAct(action: string) {
  if (action.startsWith('move-')) return onMoveAct(action);
  switch (action) {
    case 'build':
      return (showBuild.value = true);
    case 'campus':
      return (showCampus.value = true);
    case 'move':
      return startMove();
    case 'attack':
      return game.findMatch(quickSim.value);
    case 'collect':
      return collect();
    case 'squad':
      return openSquad('grid');
    case 'hub':
      return openHub('defence');
    case 'defence':
      return openHub('defence');
    case 'home':
      return goHome();
    case 'settings':
      return (showSettings.value = true);
  }
}

function goHome() {
  const owned = store.user?.clubs;
  const first = Array.isArray(owned) && owned.length ? owned[0] : null;
  const id = first ? (typeof first === 'string' ? first : (first as any)._id) : null;
  router.push(id ? `/game/${id}` : '/start');
}

function focusOn(key: CampusBuilding) {
  const p = view.value?.placement[key];
  if (!p) return;
  const [w, d] = footprint(key, p.rot);
  campusRef.value?.focus((p.x + w / 2) * CELL, (p.z + d / 2) * CELL);
}

function onSettingsAct(action: string) {
  showSettings.value = false;
  if (action === 'account') router.push('/u/settings');
  else if (action === 'logout') logout();
}

async function logout() {
  try {
    await client.users.logoutUser.mutation({
      params: { id: (store.user as { userID?: string })?.userID ?? '' },
      body: {},
    });
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

// Deep links: /game/:id?open=build|squad|hub|defence|settings|attack
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
