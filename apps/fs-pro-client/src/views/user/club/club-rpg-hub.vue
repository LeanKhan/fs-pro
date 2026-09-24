<template>
  <div class="club-rpg-hub position-relative overflow-hidden">
    <!-- Top HUD -->
    <club-top-hud
      :club-name="club?.Name || 'Segun FC'"
      :club-level="clubLevel"
      :location="clubLocation"
      :motto="clubMotto"
      :budget="treasury"
      :coins="0"
      :fans="fansCount"
      :reputation="reputationCount"
      @open-settings="showSettings = true"
    ></club-top-hud>

    <!-- Center Stage: The Interactive Base -->
    <club-campus-stage
      :pins="campusPins"
      @select-facility="onSelectFacility"
    ></club-campus-stage>

    <!-- Left Floating Overlay -->
    <div class="left-overlay d-flex flex-column gap-3">
      <club-overview-card
        :level="clubLevel"
        :squad-value="squadValue"
        :fans="fansCount"
        :reputation="reputationCount"
        :power="clubPower"
      ></club-overview-card>

      <next-goal-card
        v-if="playState?.challenge"
        :title="playState.challenge.title"
        :target-wins="playState.challenge.targetWins"
        :current-wins="playState.challenge.wins"
        :reward-cash="playState.challenge.rewardCash"
        :reward-fans="150"
        :seconds-left="challengeSecondsLeft"
      ></next-goal-card>

      <manager-briefing-toast
        :title="managerBriefingTitle"
        :message="managerBriefingMessage"
      ></manager-briefing-toast>
    </div>

    <!-- Right Floating Overlay -->
    <div class="right-overlay">
      <facilities-quick-list
        :facility-items="quickFacilityItems"
        @select-facility="onSelectFacility"
      ></facilities-quick-list>
    </div>

    <!-- Bottom Dock Navigation & Play Button -->
    <bottom-dock-nav
      :current-tab="currentTab"
      :is-cooldown="cooldownLeft > 0"
      :cooldown-seconds="cooldownLeft"
      :playing="playing"
      @change-tab="onTabChange"
      @play-match="onPlayMatchClick"
    ></bottom-dock-nav>

    <!-- Facility Upgrade Modal Sheet -->
    <facility-detail-sheet
      v-model="showFacilitySheet"
      :asset="selectedAsset"
      :icon="selectedFacilityIcon"
      :read-only="readOnly"
      :upgrading="upgradingAsset !== null"
      :now-ms="now"
      @upgrade="onStartUpgrade"
    ></facility-detail-sheet>

    <!-- Matchmaking / Pre-Battle Modal -->
    <matchmaking-modal
      v-model="showMatchmaking"
      :searching="matchmakingSearching"
      :starting="playing"
      :my-club-name="club?.Name || 'Segun FC'"
      :my-power="clubPower"
      :opponent="matchedOpponent"
      @start-battle="executeMatch"
    ></matchmaking-modal>

    <!-- Match Rewards Celebration Dialog -->
    <match-rewards-dialog
      v-model="showRewards"
      :result="matchResult"
      :my-club-name="club?.Name || 'Segun FC'"
      :my-power="clubPower"
    ></match-rewards-dialog>

    <v-snackbar v-model="snackbar" :timeout="3500" :color="snackbarColor">
      {{ snackbarText }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Campus, AssetState, PlayState, MatchResult } from '@repo/api-contract';
import { client } from '@/services/api';

import ClubTopHud from '@/components/hud/club-top-hud.vue';
import ClubOverviewCard from '@/components/hud/club-overview-card.vue';
import NextGoalCard from '@/components/hud/next-goal-card.vue';
import ManagerBriefingToast from '@/components/hud/manager-briefing-toast.vue';
import FacilitiesQuickList, { type QuickFacilityItem } from '@/components/hud/facilities-quick-list.vue';
import BottomDockNav from '@/components/hud/bottom-dock-nav.vue';
import ClubCampusStage, { type FacilityPin } from '@/components/campus/club-campus-stage.vue';
import FacilityDetailSheet from '@/components/campus/facility-detail-sheet.vue';
import MatchmakingModal from '@/components/play/matchmaking-modal.vue';
import MatchRewardsDialog from '@/components/play/match-rewards-dialog.vue';

const props = withDefaults(
  defineProps<{
    club?: any | null;
    readOnly?: boolean;
  }>(),
  {
    club: null,
    readOnly: false,
  }
);

const emit = defineEmits<{
  (e: 'update-available'): void;
  (e: 'switch-view', tabKey: string): void;
}>();

// State
const playState = ref<PlayState | null>(null);
const campus = ref<Campus | null>(null);
const loading = ref(false);
const playing = ref(false);
const upgradingAsset = ref<string | null>(null);

const currentTab = ref('hq');
const showSettings = ref(false);

const showFacilitySheet = ref(false);
const selectedAssetKey = ref<string | null>(null);

const showMatchmaking = ref(false);
const matchmakingSearching = ref(false);
const matchedOpponent = ref<{ name: string; power: number } | null>(null);
const matchedOpponentId = ref<string | null>(null);

const showRewards = ref(false);
const matchResult = ref<MatchResult | null>(null);

const snackbar = ref(false);
const snackbarText = ref('');
const snackbarColor = ref('success');

// Real-time clock ticker
const now = ref(Date.now());
const loadedAt = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;

const elapsed = computed(() => Math.max(Math.floor((now.value - loadedAt.value) / 1000), 0));
const cooldownLeft = computed(() => Math.max((playState.value?.cooldownSeconds ?? 0) - elapsed.value, 0));
const challengeSecondsLeft = computed(() =>
  Math.max((playState.value?.challenge?.secondsLeft ?? 0) - elapsed.value, 0)
);

// Club info computations
const clubLevel = computed(() => playState.value?.club.level ?? 0);
const clubPower = computed(() => playState.value?.club.power ?? 180);
const treasury = computed(() => playState.value?.club.budget ?? props.club?.Budget ?? 10000);
// Real standing from the server (world/club-standing.service.ts).
const fansCount = computed(() => playState.value?.standing.fans ?? props.club?.Fans ?? 0);
const reputationCount = computed(() => playState.value?.standing.reputation ?? props.club?.Reputation ?? 0);

const squadValue = computed(() => {
  if (!Array.isArray(props.club?.Players) || props.club.Players.length === 0) return 80000;
  return props.club.Players.reduce((sum: number, p: any) => sum + (Number(p.Value) || 10000), 0);
});

const clubLocation = computed(() => {
  const city = props.club?.City || props.club?.HomePlace?.Name || 'Abuja';
  const country = props.club?.Country || 'Nigeria';
  return `${city}, ${country}`;
});

const clubMotto = computed(() => props.club?.Motto || 'Small Steps, Big Dreams');

const managerBriefingTitle = computed(() => {
  if (props.club?.Manager) {
    return `Manager ${props.club.Manager.FirstName} reporting`;
  }
  return `Welcome to ${props.club?.Name || 'Segun FC'}!`;
});

const managerBriefingMessage = computed(() => {
  if (cooldownLeft.value > 0) {
    return 'The squad is currently resting and recovering fitness between matches.';
  }
  return 'Your journey starts here. Build your club, train your team and take on your first opponents.';
});

// Map assets from campus to visual pins
const campusPins = computed<FacilityPin[]>(() => {
  const assets = campus.value?.assets ?? [];
  const getAsset = (type: string) => assets.find((a) => a.type === type);

  const standsAsset = getAsset('stands');
  const trainingAsset = getAsset('training_ground');
  const academyAsset = getAsset('youth_academy');
  const scoutingAsset = getAsset('scouting');
  const medicalAsset = getAsset('medical_centre');
  const staffAsset = getAsset('staff_house');

  return [
    {
      key: 'stands',
      title: 'Stadium',
      icon: '🏟️',
      level: standsAsset?.level ?? 0,
      top: 15,
      left: 55,
      isUpgrading: !!standsAsset?.upgrade,
    },
    {
      key: 'training_ground',
      title: 'Training Ground',
      icon: '🦺',
      level: trainingAsset?.level ?? 0,
      top: 23,
      left: 31,
      isUpgrading: !!trainingAsset?.upgrade,
    },
    {
      key: 'main_office',
      title: 'Main Office',
      icon: '💼',
      level: clubLevel.value,
      top: 36,
      left: 48,
    },
    {
      key: 'youth_academy',
      title: 'Academy',
      icon: '🎓',
      level: academyAsset?.level ?? 0,
      top: 41,
      left: 70,
      isUpgrading: !!academyAsset?.upgrade,
    },
    {
      key: 'scouting',
      title: 'Scouting',
      icon: '🔭',
      level: scoutingAsset?.level ?? 0,
      top: 48,
      left: 27,
      isUpgrading: !!scoutingAsset?.upgrade,
    },
    {
      key: 'medical_centre',
      title: 'Medical Centre',
      icon: '➕',
      level: medicalAsset?.level ?? 0,
      top: 59,
      left: 43,
      isUpgrading: !!medicalAsset?.upgrade,
    },
    {
      key: 'staff_house',
      title: 'Staff House',
      icon: '👥',
      level: staffAsset?.level ?? 0,
      top: 58,
      left: 60,
      isUpgrading: !!staffAsset?.upgrade,
    },
  ];
});

// Quick facilities list for right sidebar
const quickFacilityItems = computed<QuickFacilityItem[]>(() => {
  const assets = campus.value?.assets ?? [];
  const getAsset = (type: string) => assets.find((a) => a.type === type);

  const stands = getAsset('stands');
  const training = getAsset('training_ground');
  const academy = getAsset('youth_academy');
  const medical = getAsset('medical_centre');
  const scouting = getAsset('scouting');
  const staffHouse = getAsset('staff_house');

  function getProgress(asset?: AssetState) {
    if (!asset?.upgrade) return 0;
    const start = new Date(asset.upgrade.startAt).getTime();
    const total = Math.max(new Date(asset.upgrade.completeAt).getTime() - start, 1);
    return Math.min(100, Math.max(0, Math.round(((now.value - start) / total) * 100)));
  }

  return [
    {
      key: 'stands',
      name: 'Stadium',
      icon: '🏟️',
      level: stands?.level ?? 0,
      progress: getProgress(stands),
      isUpgrading: !!stands?.upgrade,
    },
    {
      key: 'training_ground',
      name: 'Training Ground',
      icon: '🦺',
      level: training?.level ?? 0,
      progress: getProgress(training),
      isUpgrading: !!training?.upgrade,
    },
    {
      key: 'youth_academy',
      name: 'Academy',
      icon: '🎓',
      level: academy?.level ?? 0,
      progress: getProgress(academy),
      isUpgrading: !!academy?.upgrade,
    },
    {
      key: 'medical_centre',
      name: 'Medical Centre',
      icon: '➕',
      level: medical?.level ?? 0,
      progress: getProgress(medical),
      isUpgrading: !!medical?.upgrade,
    },
    {
      key: 'scouting',
      name: 'Scouting',
      icon: '🔭',
      level: scouting?.level ?? 0,
      progress: getProgress(scouting),
      isUpgrading: !!scouting?.upgrade,
    },
    {
      key: 'staff_house',
      name: 'Staff House',
      icon: '💼',
      level: staffHouse?.level ?? 0,
      progress: getProgress(staffHouse),
      isUpgrading: !!staffHouse?.upgrade,
    },
  ];
});

// Selected asset for modal sheet
const selectedAsset = computed<AssetState | null>(() => {
  if (!selectedAssetKey.value) return null;
  const match = campus.value?.assets.find((a) => a.type === selectedAssetKey.value);
  if (match) return match;

  // Synthesize informational asset for ones not in DB yet
  const names: Record<string, string> = {
    main_office: 'Main Office',
  };
  const desc: Record<string, string> = {
    main_office: 'The central administration building of your club, coordinating commercial deals.',
  };

  return {
    type: selectedAssetKey.value,
    name: names[selectedAssetKey.value] || 'Club Facility',
    description: desc[selectedAssetKey.value] || 'Club infrastructure asset.',
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

const selectedFacilityIcon = computed(() => {
  const icons: Record<string, string> = {
    stands: '🏟️',
    stadium_grounds: '🌱',
    training_ground: '🦺',
    youth_academy: '🎓',
    main_office: '💼',
    scouting: '🔭',
    medical_centre: '➕',
    staff_house: '👥',
  };
  return selectedAssetKey.value ? icons[selectedAssetKey.value] || '🏛️' : '🏛️';
});

function onSelectFacility(key: string) {
  selectedAssetKey.value = key;
  showFacilitySheet.value = true;
}

function onTabChange(tabKey: string) {
  currentTab.value = tabKey;
  emit('switch-view', tabKey);
}

// Data loaders
async function load() {
  const clubId = props.club?._id;
  if (!clubId) return;

  loading.value = true;
  try {
    const [playRes, campusRes] = await Promise.all([
      client.play.getPlayState.query({ params: { clubId } }),
      client.facilities.getCampus.query({ params: { clubId } }),
    ]);

    if (playRes.status === 200) {
      playState.value = playRes.body.payload;
      loadedAt.value = Date.now();
    }
    if (campusRes.status === 200) {
      campus.value = campusRes.body.payload;
    }
  } catch (err) {
    console.error('Failed to load club RPG hub state:', err);
  } finally {
    loading.value = false;
  }
}

// Upgrade Action
async function onStartUpgrade(assetType: string) {
  const clubId = props.club?._id;
  if (!clubId) return;

  upgradingAsset.value = assetType;
  try {
    const res = await client.facilities.startUpgrade.mutation({
      params: { clubId },
      body: { assetType },
    });
    if (res.status === 200) {
      campus.value = res.body.payload;
      snackbarText.value = 'Construction started!';
      snackbarColor.value = 'success';
      snackbar.value = true;
      emit('update-available');
      await load();
    } else {
      snackbarText.value = res.body.message;
      snackbarColor.value = 'error';
      snackbar.value = true;
    }
  } catch (err) {
    console.error('Failed to start upgrade:', err);
    snackbarText.value = 'Could not start construction.';
    snackbarColor.value = 'error';
    snackbar.value = true;
  } finally {
    upgradingAsset.value = null;
  }
}

// Play Match Flow
async function onPlayMatchClick() {
  const clubId = props.club?._id;
  if (!clubId || cooldownLeft.value > 0 || playing.value) return;

  // Open the matchmaking modal and ask the server for real opponent options.
  matchmakingSearching.value = true;
  matchedOpponent.value = null;
  matchedOpponentId.value = null;
  showMatchmaking.value = true;

  try {
    // Keep the radar animation up for a beat even if the server answers fast.
    const [res] = await Promise.all([
      client.play.findOpponents.query({ params: { clubId } }),
      new Promise((resolve) => setTimeout(resolve, 900)),
    ]);
    if (res.status === 200 && res.body.payload.length) {
      const [recommended] = res.body.payload; // closest power
      matchedOpponent.value = { name: recommended.name, power: recommended.power };
      matchedOpponentId.value = recommended.id;
    } else {
      showMatchmaking.value = false;
      snackbarText.value = res.status === 200 ? 'No opponent available right now' : res.body.message;
      snackbarColor.value = 'error';
      snackbar.value = true;
    }
  } catch (err) {
    console.error('Failed to find an opponent:', err);
    showMatchmaking.value = false;
    snackbarText.value = 'Could not find an opponent.';
    snackbarColor.value = 'error';
    snackbar.value = true;
  } finally {
    matchmakingSearching.value = false;
  }
}

async function executeMatch() {
  const clubId = props.club?._id;
  if (!clubId) return;

  playing.value = true;
  try {
    const res = await client.play.playMatch.mutation({
      params: { clubId },
      body: matchedOpponentId.value ? { opponentId: matchedOpponentId.value } : {},
    });

    if (res.status === 200) {
      matchResult.value = res.body.payload;
      playState.value = res.body.payload.state;
      loadedAt.value = Date.now();
      showMatchmaking.value = false;
      showRewards.value = true;
      emit('update-available');
    } else {
      showMatchmaking.value = false;
      snackbarText.value = res.body.message;
      snackbarColor.value = 'error';
      snackbar.value = true;
      await load();
    }
  } catch (err) {
    console.error('Failed to execute match:', err);
    showMatchmaking.value = false;
    snackbarText.value = 'Could not execute the match.';
    snackbarColor.value = 'error';
    snackbar.value = true;
  } finally {
    playing.value = false;
  }
}

watch(() => props.club?._id, load, { immediate: true });

onMounted(() => {
  timer = setInterval(() => (now.value = Date.now()), 1000);
});

onBeforeUnmount(() => timer && clearInterval(timer));

defineExpose({ reload: load });
</script>

<style scoped>
.club-rpg-hub {
  width: 100%;
  height: 100vh;
  background-color: #080c14;
}

.left-overlay {
  position: absolute;
  top: 90px;
  left: 24px;
  z-index: 15;
  pointer-events: none;
}

.right-overlay {
  position: absolute;
  top: 90px;
  right: 24px;
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
