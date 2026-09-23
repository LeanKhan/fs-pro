<template>
  <div class="club-game">
    <div v-if="clubQuery.isLoading.value" class="cg-state">
      <v-progress-circular indeterminate color="amber" size="48"></v-progress-circular>
    </div>

    <div v-else-if="clubQuery.isError.value || !club" class="cg-state flex-column">
      <div class="text-h6 mb-3">Could not load this club.</div>
      <v-btn variant="tonal" to="/u">Back to dashboard</v-btn>
    </div>

    <template v-else>
      <!-- The map: zoomable/pannable image + interactable hotspots with refined styling -->
      <campus-map
        :assets="game.campus.value?.assets ?? []"
        :selected="showSheet ? selectedKey : null"
        :now-ms="game.now.value"
        :debug="debug"
        :fans-count="fansCount"
        :club-code="club.ClubCode"
        @select="onSelectFacility"
      />


      <!-- Top HUD header: crest, level, location, treasury -->
      <club-top-hud
        :club-name="club.Name"
        :club-level="playState?.club.level ?? 0"
        :location="clubLocation"
        :budget="treasury"
        @open-settings="goManager('club')"
      />

      <!-- Left Floating Overlays (Overview, Next Goal, Manager Speech) -->
      <div class="left-overlay d-flex flex-column gap-3">
        <club-overview-card
          :level="playState?.club.level ?? 0"
          :squad-value="squadValue"
          :fans="fansCount"
          :reputation="reputationCount"
          :power="playState?.club.power ?? 0"
        />

        <next-goal-card
          v-if="playState?.challenge"
          :title="playState.challenge.title"
          :target-wins="playState.challenge.targetWins"
          :current-wins="playState.challenge.wins"
          :reward-cash="playState.challenge.rewardCash"
          :reward-fans="150"
          :seconds-left="game.challengeLeft.value"
        />

        <manager-briefing-toast
          :title="managerBriefingTitle"
          :message="managerBriefingMessage"
        />
      </div>

      <!-- Right Floating Overlay (Facilities Quick List) -->
      <div class="right-overlay">
        <facilities-quick-list
          :facility-items="quickFacilityItems"
          @select-facility="onSelectFacility"
        />
      </div>

      <!-- Bottom Dock Navigation & Play Match Action -->
      <bottom-dock-nav
        current-tab="hq"
        :is-cooldown="game.cooldownLeft.value > 0"
        :cooldown-seconds="game.cooldownLeft.value"
        :playing="game.playing.value"
        @change-tab="onDockTabChange"
        @play-match="onPlayMatchTrigger"
      />

      <!-- Sheets and dialogs -->
      <facility-detail-sheet
        v-model="showSheet"
        :club-id="clubId"
        :asset="selectedAsset"
        :icon="selectedIcon"
        :read-only="!isMyClub"
        :upgrading="game.upgradingAsset.value !== null"
        :now-ms="game.now.value"
        :budget="game.campus.value?.budget ?? null"
        @upgrade="game.startUpgrade"
        @treated="onMedicalTreated"
      />

      <matchmaking-modal
        v-model="game.showMatchmaking.value"
        :searching="game.matchmakingSearching.value"
        :starting="game.playing.value"
        :my-club-name="club.Name"
        :my-power="playState?.club.power ?? 0"
        :opponent="game.matchedOpponent.value"
        :opponents="game.opponentOptions.value"
        :tactics-summary="tacticsSummary"
        :is-quick-sim="game.isQuickSim.value"
        @toggle-quick-sim="(val) => (game.isQuickSim.value = val)"
        @select-opponent="game.selectOpponent"
        @start-battle="game.startBattle()"
        @change-tactics="onChangeTactics"
        @open-medical="onOpenMedicalFromMatchmaking"
      />


      <!-- Battle Arena: Animated football clash presentation -->
      <battle-arena-modal
        v-model="game.showBattleArena.value"
        :result="game.matchResult.value"
        :my-club-name="club.Name"
        :my-power="playState?.club.power ?? 0"
        :coaching-level="game.coachingLevel.value"
        @finish="game.finishBattle()"
      />

      <match-rewards-dialog
        v-model="game.showRewards.value"
        :result="game.matchResult.value"
        :my-club-name="club.Name"
        :my-power="playState?.club.power ?? 0"
      />

      <!-- Executive Briefing: Offline catchup modal -->
      <away-summary-modal
        v-model="showAwaySummary"
        :events="awayEvents"
      />


      <v-snackbar v-model="game.snackbar.value" :timeout="3500" :color="game.snackbarColor.value">
        {{ game.snackbarText.value }}
      </v-snackbar>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import type { AssetState } from '@repo/api-contract';
import { client } from '@/services/api';
import { useStore } from '@/store';
import { useClubGame } from '@/composables/use-club-game';

import CampusMap from '@/components/game/campus-map.vue';
import ClubTopHud from '@/components/hud/club-top-hud.vue';
import ClubOverviewCard from '@/components/hud/club-overview-card.vue';
import NextGoalCard from '@/components/hud/next-goal-card.vue';
import ManagerBriefingToast from '@/components/hud/manager-briefing-toast.vue';
import FacilitiesQuickList, { type QuickFacilityItem } from '@/components/hud/facilities-quick-list.vue';
import BottomDockNav from '@/components/hud/bottom-dock-nav.vue';
import { HOTSPOTS } from '@/components/game/map-config';
import FacilityDetailSheet from '@/components/campus/facility-detail-sheet.vue';
import MatchmakingModal from '@/components/play/matchmaking-modal.vue';
import BattleArenaModal from '@/components/play/battle-arena-modal.vue';
import MatchRewardsDialog from '@/components/play/match-rewards-dialog.vue';
import AwaySummaryModal, { type AwayEventItem } from '@/components/hud/away-summary-modal.vue';


const route = useRoute();
const router = useRouter();
const store = useStore();

if (!store.isAuthenticated) store.getUser();

const clubId = computed(() => route.params.clubId as string);
const debug = computed(() => route.query.debug === '1');

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

const isMyClub = computed(() => {
  const id = club.value?._id;
  const owned = store.user?.clubs;
  if (!id || !Array.isArray(owned)) return false;
  return owned.some((c: any) => (typeof c === 'string' ? c : c._id) === id);
});

const treasury = computed(() => playState.value?.club.budget ?? club.value?.Budget ?? 10000);
const clubLevel = computed(() => playState.value?.club.level ?? 0);

const clubLocation = computed(() => {
  const city = (club.value as any)?.City || (club.value as any)?.HomePlace?.Name || 'Abuja';
  const country = (club.value as any)?.Country || 'Nigeria';
  return `${city}, ${country}`;
});

const fansCount = computed(() => {
  if ((club.value as any)?.Fans) return Number((club.value as any).Fans);
  return 120 + clubLevel.value * 150;
});

const reputationCount = computed(() => {
  if ((club.value as any)?.Reputation) return Number((club.value as any).Reputation);
  return 3 + clubLevel.value * 2;
});

const squadValue = computed(() => {
  const players = (club.value as any)?.Players;
  if (!Array.isArray(players) || players.length === 0) return 80000;
  return players.reduce((sum: number, p: any) => sum + (Number(p.Value) || 10000), 0);
});

// Lightweight pre-match tactics readiness check (matchmaking-modal.vue): a
// glance at the Team Sheet's formation/style/lineup, not a second editor -
// the Dugout hotspot on the map opens the real editor (Team Sheet zone).
const FORMATION_LABELS: Record<string, string> = {
  '433': '4-3-3',
  '442': '4-4-2',
  '4231': '4-2-3-1',
  '352': '3-5-2',
};
const STYLE_LABELS: Record<string, string> = {
  HighPress: 'High Press',
  LowBlock: 'Low Block',
};
const tacticsSummary = computed(() => {
  const c = club.value as any;
  if (!c) return null;
  const formationRaw = c.Tactic?.formationName as string | undefined;
  const formationLabel = formationRaw ? FORMATION_LABELS[formationRaw] ?? formationRaw : 'Not set';
  const styleRaw = c.Tactic?.styleName as string | undefined;
  const styleLabel = styleRaw ? STYLE_LABELS[styleRaw] ?? styleRaw : 'Balanced';

  const startingIds: string[] = Array.isArray(c.Lineup?.startingXI) ? c.Lineup.startingXI : [];
  const players: any[] = Array.isArray(c.Players) ? c.Players : [];
  const starters = startingIds.map((id) => players.find((p) => String(p._id) === id)).filter(Boolean);
  const injuredCount = starters.filter((p) => p.Injury && Number(p.Injury.daysRemaining) > 0).length;

  const issues: string[] = [];
  if (starters.length < 11) issues.push(`${11 - starters.length} lineup slot(s) empty`);
  if (injuredCount > 0) issues.push(`${injuredCount} starter(s) injured`);

  return { formationLabel, styleLabel, filledCount: starters.length, issues, ready: issues.length === 0 };
});

/** "Change Tactics" from the pre-match screen: close the modal, go edit. */
function onChangeTactics() {
  game.showMatchmaking.value = false;
  goManager('tactics');
}

function onMedicalTreated() {
  clubQuery.refetch();
  game.load();
}

function onOpenMedicalFromMatchmaking() {
  game.showMatchmaking.value = false;
  onSelectFacility('medical_centre');
}

const managerBriefingTitle = computed(() => {
  if ((club.value as any)?.Manager) {
    return `Manager ${(club.value as any).Manager.FirstName} reporting`;
  }
  return `Welcome to ${club.value?.Name || 'Segun FC'}!`;
});

const managerBriefingMessage = computed(() => {
  if (game.cooldownLeft.value > 0) {
    return 'The squad is currently resting and recovering fitness between matches.';
  }
  return 'Your journey starts here. Build your club, train your team and take on your first opponents.';
});

const FACILITY_CONFIG: Array<{ key: string; name: string; icon: string }> = [
  { key: 'stands', name: 'Stadium', icon: '🏟️' },
  { key: 'stadium_grounds', name: 'Pitch Grounds', icon: '🌱' },
  { key: 'training_ground', name: 'Training Ground', icon: '🦺' },
  { key: 'youth_academy', name: 'Academy', icon: '🎓' },
  { key: 'medical_centre', name: 'Medical Centre', icon: '➕' },
  { key: 'scouting', name: 'Scouting Dept', icon: '🔭' },
  { key: 'staff_house', name: 'Staff House', icon: '💼' },
];

// Quick facilities list for right sidebar
const quickFacilityItems = computed<QuickFacilityItem[]>(() => {
  const assets = game.campus.value?.assets ?? [];
  const getAsset = (type: string) => assets.find((a) => a.type === type);

  function getProgress(asset?: AssetState) {
    if (!asset?.upgrade) return 0;
    const start = new Date(asset.upgrade.startAt).getTime();
    const total = Math.max(new Date(asset.upgrade.completeAt).getTime() - start, 1);
    return Math.min(100, Math.max(0, Math.round(((game.now.value - start) / total) * 100)));
  }

  return FACILITY_CONFIG.map((cfg) => {
    const asset = getAsset(cfg.key);
    return {
      key: cfg.key,
      name: cfg.name,
      icon: cfg.icon,
      level: asset?.level ?? 0,
      progress: getProgress(asset),
      isUpgrading: !!asset?.upgrade,
    };
  });
});

// While You Were Away Executive Summary
const showAwaySummary = ref(false);
const awayEvents = ref<AwayEventItem[]>([]);

function checkOfflineProgress() {
  if (!clubId.value) return;
  const storageKey = `fspro_last_seen_${clubId.value}`;
  const rawLastSeen = localStorage.getItem(storageKey);
  const nowTime = Date.now();
  localStorage.setItem(storageKey, String(nowTime));

  if (!rawLastSeen) return;
  const lastSeenMs = Number(rawLastSeen);
  const diffSec = (nowTime - lastSeenMs) / 1000;

  // Only show if player was away for more than 2 minutes (120 seconds)
  if (diffSec < 120) return;

  const events: AwayEventItem[] = [];
  const assets = game.campus.value?.assets ?? [];

  // 1. Upgrades in progress or completed
  const upgrading = assets.find((a) => a.upgrade);
  if (upgrading) {
    const completeAt = new Date(upgrading.upgrade!.completeAt).getTime();
    if (completeAt <= nowTime) {
      events.push({
        icon: '🏗️',
        title: `${upgrading.name} Upgrade Ready!`,
        description: `Construction finished while you were away! Facility upgraded.`,
        badge: 'COMPLETED',
        badgeColor: 'success',
      });
    } else {
      events.push({
        icon: '🔨',
        title: `Work Continues: ${upgrading.name}`,
        description: `Contractors are advancing work towards Level ${upgrading.upgrade!.toLevel}.`,
        badge: 'IN PROGRESS',
        badgeColor: 'amber-darken-2',
      });
    }
  }

  // 2. Squad resting status
  if (game.cooldownLeft.value === 0) {
    events.push({
      icon: '⚡',
      title: 'Squad Fully Rested',
      description: 'Your players have completely recovered stamina and are ready for battle.',
      badge: 'READY',
      badgeColor: 'teal',
    });
  }

  // 3. Scouting & Matchmaking pool
  const scouting = assets.find((a) => a.type === 'scouting');
  if (scouting && scouting.level > 0) {
    events.push({
      icon: '🔭',
      title: 'Scouting Network Active',
      description: `Scouts surveyed the region and tracked ${1 + Math.min(scouting.level, 4)} rival clubs in your power bracket.`,
      badge: 'POOL READY',
      badgeColor: 'primary',
    });
  } else {
    events.push({
      icon: '🏟️',
      title: 'Campus Operational',
      description: 'Stadium maintenance staff kept the grounds in order for upcoming matches.',
      badge: 'ACTIVE',
      badgeColor: 'indigo',
    });
  }

  if (events.length > 0) {
    awayEvents.value = events;
    showAwaySummary.value = true;
  }
}

// Trigger offline check when campus data finishes initial load
let checkedOffline = false;
watch(
  () => game.campus.value,
  (loaded) => {
    if (loaded && !checkedOffline) {
      checkedOffline = true;
      checkOfflineProgress();
    }
  }
);


// Facility sheet selection
const showSheet = ref(false);
const selectedKey = ref<string | null>(null);

const selectedAsset = computed(() => {
  if (!selectedKey.value) return null;
  const match = game.campus.value?.assets.find((a) => a.type === selectedKey.value);
  if (match) return match;

  const names: Record<string, string> = {
    main_office: 'Main Office',
    scouting: 'Scouting Department',
    medical_centre: 'Medical Centre',
    staff_house: 'Staff House',
  };
  const desc: Record<string, string> = {
    main_office: 'The central administration building of your club, coordinating commercial deals.',
    scouting: 'Expands your scouting network to reveal better opponents and transfer targets.',
    medical_centre: 'Speeds up squad recovery times and reduces injury durations.',
    staff_house: 'Accommodates specialized coaches, unlocking advanced tactical abilities in matches.',
  };

  return {
    type: selectedKey.value,
    name: names[selectedKey.value] || 'Club Facility',
    description: desc[selectedKey.value] || 'Club infrastructure asset.',
    level: 0,
    maxLevel: 5,
    effectLabel: 'Foundation established.',
    effects: {},
    upgrade: null,
    next: {
      level: 1,
      cost: 25000,
      minutes: 15,
      effectLabel: 'Unlocks department operations.',
      blockedReason: 'Under development in future season updates.',
    },
  };
});

const selectedIcon = computed(() => {
  const match = HOTSPOTS.find((h) => h.key === selectedKey.value);
  if (match) return match.icon;
  const fallbacks: Record<string, string> = {
    stands: '🏟️',
    stadium_grounds: '🌱',
    training_ground: '🦺',
    youth_academy: '🎓',
    main_office: '💼',
    scouting: '🔭',
    medical_centre: '➕',
    staff_house: '👥',
  };
  return selectedKey.value ? fallbacks[selectedKey.value] || '🏛️' : '🏛️';
});

function onSelectFacility(key: string) {
  // The Dugout isn't a leveled facility (no ClubAssets row/upgrade economy) -
  // it opens the Team Sheet editor directly instead of the upgrade sheet.
  if (key === 'dugout') {
    goManager('tactics');
    return;
  }
  selectedKey.value = key;
  showSheet.value = true;
}

function onDockTabChange(key: string) {
  if (key === 'hq') return;
  goManager(key);
}

function onPlayMatchTrigger(mode: 'battle' | 'quick_sim') {
  game.findMatch(mode === 'quick_sim');
}


function goManager(key?: string) {
  const c = club.value;
  if (!c) return;
  // Indices into the manager dashboard's v-tabs (dashboard.vue): Home, Team
  // Sheet, Squad Zone, Club Zone, Director's Box, Transfer Zone, Analysis.
  // There is no Shop or Matches tab, so the dock only offers what exists here.
  const tabs: Record<string, number> = {
    tactics: 1,
    squad: 2,
    club: 3,
    transfers: 5,
  };
  router.push({
    path: `/u/clubs/${c._id}/${c.ClubCode}`,
    query: key && key in tabs ? { tab: String(tabs[key]) } : {},
  });
}
</script>

<style scoped>
.club-game {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #080c14;
  color: #fff;
  user-select: none;
}

.cg-state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.left-overlay {
  position: absolute;
  top: 90px;
  left: 20px;
  z-index: 15;
  pointer-events: none;
}

.right-overlay {
  position: absolute;
  top: 90px;
  right: 20px;
  z-index: 15;
  pointer-events: none;
}

@media (max-width: 960px) {
  .left-overlay {
    top: 80px;
    left: 12px;
  }
  .right-overlay {
    display: none;
  }
}
</style>
