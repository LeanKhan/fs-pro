import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import type { AssetState, Campus, MatchResult, PlayState } from '@repo/api-contract';
import { client } from '@/services/api';

/**
 * State and actions for the club game screen (views/game/club-game.vue):
 * play state + campus, a 1s ticker for countdowns, facility upgrades and the
 * PLAY flow (matchmaking preview -> match -> rewards).
 */
export function useClubGame(clubId: Ref<string | undefined>, onChanged?: () => void) {
  const playState = ref<PlayState | null>(null);
  const campus = ref<Campus | null>(null);
  const loading = ref(false);
  const playing = ref(false);
  const upgradingAsset = ref<string | null>(null);

  // Matchmaking / result dialogs
  const showMatchmaking = ref(false);
  const matchmakingSearching = ref(false);
  const matchedOpponent = ref<{ name: string; power: number } | null>(null);
  const matchedOpponentId = ref<string | null>(null);
  const showRewards = ref(false);
  const matchResult = ref<MatchResult | null>(null);

  // Toast
  const snackbar = ref(false);
  const snackbarText = ref('');
  const snackbarColor = ref('success');
  function toast(text: string, color = 'success') {
    snackbarText.value = text;
    snackbarColor.value = color;
    snackbar.value = true;
  }

  // Ticker for local countdowns between fetches
  const now = ref(Date.now());
  const loadedAt = ref(Date.now());
  let timer: ReturnType<typeof setInterval> | undefined;
  const elapsed = computed(() => Math.max(Math.floor((now.value - loadedAt.value) / 1000), 0));
  const cooldownLeft = computed(() => Math.max((playState.value?.cooldownSeconds ?? 0) - elapsed.value, 0));
  const challengeLeft = computed(() =>
    Math.max((playState.value?.challenge.secondsLeft ?? 0) - elapsed.value, 0)
  );

  async function load() {
    if (!clubId.value) return;
    loading.value = true;
    try {
      const [playRes, campusRes] = await Promise.all([
        client.play.getPlayState.query({ params: { clubId: clubId.value } }),
        client.facilities.getCampus.query({ params: { clubId: clubId.value } }),
      ]);
      if (playRes.status === 200) {
        playState.value = playRes.body.payload;
        loadedAt.value = Date.now();
      }
      if (campusRes.status === 200) campus.value = campusRes.body.payload;
    } catch (err) {
      console.error('Failed to load the club game:', err);
      toast('Could not load your club.', 'error');
    } finally {
      loading.value = false;
    }
  }

  async function startUpgrade(assetType: string) {
    if (!clubId.value) return;
    upgradingAsset.value = assetType;
    try {
      const res = await client.facilities.startUpgrade.mutation({
        params: { clubId: clubId.value },
        body: { assetType },
      });
      if (res.status === 200) {
        campus.value = res.body.payload;
        toast('Construction started!');
        onChanged?.();
        await load();
      } else {
        toast(res.body.message, 'error');
      }
    } catch (err) {
      console.error('Failed to start upgrade:', err);
      toast('Could not start construction.', 'error');
    } finally {
      upgradingAsset.value = null;
    }
  }

  /** PLAY pressed: ask the server for a real opponent, then wait for "battle". */
  async function findMatch() {
    if (!clubId.value || cooldownLeft.value > 0 || playing.value) return;
    matchmakingSearching.value = true;
    matchedOpponent.value = null;
    matchedOpponentId.value = null;
    showMatchmaking.value = true;
    try {
      const [res] = await Promise.all([
        client.play.findOpponents.query({ params: { clubId: clubId.value } }),
        new Promise((resolve) => setTimeout(resolve, 900)), // let the radar show
      ]);
      if (res.status === 200 && res.body.payload.length) {
        const [recommended] = res.body.payload; // closest power
        matchedOpponent.value = { name: recommended.name, power: recommended.power };
        matchedOpponentId.value = recommended.id;
      } else {
        showMatchmaking.value = false;
        toast(res.status === 200 ? 'No opponent available right now' : res.body.message, 'error');
      }
    } catch (err) {
      console.error('Failed to find an opponent:', err);
      showMatchmaking.value = false;
      toast('Could not find an opponent.', 'error');
    } finally {
      matchmakingSearching.value = false;
    }
  }

  async function startBattle() {
    if (!clubId.value) return;
    playing.value = true;
    try {
      const res = await client.play.playMatch.mutation({
        params: { clubId: clubId.value },
        body: matchedOpponentId.value ? { opponentId: matchedOpponentId.value } : {},
      });
      showMatchmaking.value = false;
      if (res.status === 200) {
        matchResult.value = res.body.payload;
        playState.value = res.body.payload.state;
        loadedAt.value = Date.now();
        showRewards.value = true;
        onChanged?.();
        await load();
      } else {
        toast(res.body.message, 'error');
        await load();
      }
    } catch (err) {
      console.error('Failed to play the match:', err);
      showMatchmaking.value = false;
      toast('Could not play the match.', 'error');
    } finally {
      playing.value = false;
    }
  }

  // When a running upgrade's timer hits zero, refresh once to show the new level.
  let refreshing = false;
  watch(now, () => {
    const done = campus.value?.assets.some(
      (a: AssetState) => a.upgrade && new Date(a.upgrade.completeAt).getTime() <= now.value
    );
    if (done && !refreshing) {
      refreshing = true;
      load().finally(() => (refreshing = false));
    }
  });

  watch(clubId, load, { immediate: true });
  onMounted(() => {
    timer = setInterval(() => (now.value = Date.now()), 1000);
  });
  onBeforeUnmount(() => timer && clearInterval(timer));

  return {
    playState, campus, loading, playing, upgradingAsset,
    now, cooldownLeft, challengeLeft,
    showMatchmaking, matchmakingSearching, matchedOpponent,
    showRewards, matchResult,
    snackbar, snackbarText, snackbarColor,
    load, startUpgrade, findMatch, startBattle,
  };
}

/** m:ss, or h:mm:ss for an hour or more. */
export function formatClock(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
