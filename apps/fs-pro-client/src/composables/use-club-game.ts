import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import type { AssetState, Campus, Inbox, MatchResult, PlayState } from '@repo/api-contract';
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
  const matchedOpponent = ref<{ id?: string; name: string; power: number; code?: string } | null>(null);
  const matchedOpponentId = ref<string | null>(null);
  const opponentOptions = ref<Array<{ id: string; name: string; power: number; code?: string }>>([]);
  const showBattleArena = ref(false);
  const showRewards = ref(false);
  const matchResult = ref<MatchResult | null>(null);
  /** How fans, the board and the squad reacted to results (owner only). */
  const inbox = ref<Inbox | null>(null);

  const coachingLevel = computed(() => {
    const staff = campus.value?.assets.find((a: AssetState) => a.type === 'staff_house');
    return staff?.level ?? 0;
  });

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

  /** Owner-only; a non-owner just gets no inbox. */
  async function loadInbox() {
    if (!clubId.value) return;
    try {
      const res = await client.play.getInbox.query({ params: { clubId: clubId.value } });
      if (res.status === 200) inbox.value = res.body.payload;
    } catch (err) {
      console.error('Failed to load the inbox:', err);
    }
  }

  async function markInboxRead() {
    if (!clubId.value || !inbox.value?.unread) return;
    try {
      const res = await client.play.markInboxRead.mutation({ params: { clubId: clubId.value }, body: {} });
      if (res.status === 200) inbox.value = res.body.payload;
    } catch (err) {
      console.error('Failed to mark the inbox read:', err);
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

  function selectOpponent(opp: { id: string; name: string; power: number; code?: string }) {
    matchedOpponent.value = opp;
    matchedOpponentId.value = opp.id;
  }

  const isQuickSim = ref(false);

  /** PLAY pressed: ask the server for real opponents, then wait for "battle". */
  async function findMatch(quickSim = false) {
    if (!clubId.value || cooldownLeft.value > 0 || playing.value) return;
    isQuickSim.value = quickSim;
    matchmakingSearching.value = true;
    matchedOpponent.value = null;
    matchedOpponentId.value = null;
    opponentOptions.value = [];
    showMatchmaking.value = true;
    try {
      const [res] = await Promise.all([
        client.play.findOpponents.query({ params: { clubId: clubId.value } }),
        new Promise((resolve) => setTimeout(resolve, 800)), // let the radar show
      ]);
      if (res.status === 200 && res.body.payload.length) {
        opponentOptions.value = res.body.payload;
        const [recommended] = res.body.payload; // closest power
        matchedOpponent.value = {
          id: recommended.id,
          name: recommended.name,
          power: recommended.power,
          code: recommended.code,
        };
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

  async function startBattle(overrideQuickSim?: boolean) {
    if (!clubId.value) return;
    const quick = overrideQuickSim !== undefined ? overrideQuickSim : isQuickSim.value;
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
        if (quick) {
          // Instant simulation skips battle arena directly to spoils
          showRewards.value = true;
        } else {
          // Launch the dramatic Clash-of-Clans style Battle Arena
          showBattleArena.value = true;
        }
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

  function finishBattle() {
    showBattleArena.value = false;
    showRewards.value = true;
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
    now, cooldownLeft, challengeLeft, coachingLevel,
    showMatchmaking, matchmakingSearching, matchedOpponent, opponentOptions,
    showBattleArena, showRewards, matchResult, isQuickSim, inbox,
    snackbar, snackbarText, snackbarColor,
    load, loadInbox, markInboxRead, startUpgrade, findMatch, selectOpponent, startBattle, finishBattle,
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
