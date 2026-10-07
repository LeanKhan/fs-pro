import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import type { AssetState, Campus, CampusPlacement, Inbox, MatchResult, MatchdayFixture, PlayState } from '@repo/api-contract';
import { client } from '@/services/api';
import { sfx } from '@/services/sfx';

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
  /** The shop till, ticking up between fetches (services/play/shop.ts). */
  const shopPending = computed(() => {
    const shop = playState.value?.shop;
    if (!shop) return 0;
    return Math.min(shop.cap, Math.floor(shop.pending + (shop.perHour * elapsed.value) / 3600));
  });
  const shopFull = computed(() => !!playState.value?.shop && shopPending.value >= playState.value.shop.cap);
  /** Facilities that just finished building, and a Level just reached - the
   * screen celebrates them (set on load, cleared by the screen). */
  const justBuilt = ref<string[]>([]);
  const levelReached = ref<number | null>(null);
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
        const before = playState.value?.club.level;
        playState.value = playRes.body.payload;
        loadedAt.value = Date.now();
        if (before !== undefined && playRes.body.payload.club.level > before) levelReached.value = playRes.body.payload.club.level;
      }
      if (campusRes.status === 200) {
        const was = new Map((campus.value?.assets ?? []).map((a) => [a.type, a.level]));
        campus.value = campusRes.body.payload;
        if (was.size) {
          const built = campusRes.body.payload.assets.filter((a) => a.level > (was.get(a.type) ?? a.level)).map((a) => a.type);
          if (built.length) justBuilt.value = built;
        }
      }
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
        sfx.play('build');
        toast('Construction started!');
        onChanged?.();
        await load();
      } else {
        sfx.play('error');
        toast(res.body.message, 'error');
      }
    } catch (err) {
      console.error('Failed to start upgrade:', err);
      toast('Could not start construction.', 'error');
    } finally {
      upgradingAsset.value = null;
    }
  }

  /** Saves the whole campus layout (Move mode). Returns false if the server refused it. */
  async function savePlacement(placement: CampusPlacement) {
    if (!clubId.value) return false;
    const res = await client.facilities.savePlacement.mutation({ params: { clubId: clubId.value }, body: { placement } });
    if (res.status === 200) {
      campus.value = res.body.payload;
      toast('Layout saved');
      return true;
    }
    toast(res.body.message, 'error');
    return false;
  }

  /** Bank the shop takings. Resolves to the amount collected (0 if none). */
  const collecting = ref(false);
  async function collectShop(): Promise<number> {
    if (!clubId.value || collecting.value || shopPending.value < 1) return 0;
    collecting.value = true;
    try {
      const res = await client.play.collectShop.mutation({ params: { clubId: clubId.value }, body: {} });
      if (res.status !== 200) {
        toast(res.body.message, 'error');
        return 0;
      }
      const { collected, shop, budget } = res.body.payload;
      if (playState.value) {
        // Rebase the ticking till on the fresh numbers.
        playState.value = { ...playState.value, shop, club: { ...playState.value.club, budget } };
        loadedAt.value = Date.now();
      }
      if (campus.value) campus.value = { ...campus.value, budget };
      return collected;
    } catch (err) {
      console.error('Failed to collect the shop takings:', err);
      toast('Could not collect the takings.', 'error');
      return 0;
    } finally {
      collecting.value = false;
    }
  }

  function selectOpponent(opp: { id: string; name: string; power: number; code?: string }) {
    matchedOpponent.value = opp;
    matchedOpponentId.value = opp.id;
  }

  const isQuickSim = ref(false);
  /** Matchmaking opened to book a match (no rest needed) rather than play now. */
  const bookingMode = ref(false);

  /** PLAY pressed: ask the server for real opponents, then wait for "battle".
   * `booking`: pick an opponent to book a match with instead. */
  async function findMatch(quickSim = false, booking = false) {
    if (!clubId.value || playing.value || (!booking && cooldownLeft.value > 0)) return;
    bookingMode.value = booking;
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
        // Watching records the replay the Matchzone plays; quick sim doesn't.
        body: { ...(matchedOpponentId.value ? { opponentId: matchedOpponentId.value } : {}), watch: !quick },
      });
      showMatchmaking.value = false;
      if (res.status === 200) {
        matchResult.value = res.body.payload;
        const before = playState.value?.club.level;
        playState.value = res.body.payload.state;
        if (before !== undefined && res.body.payload.state.club.level > before) levelReached.value = res.body.payload.state.club.level;
        loadedAt.value = Date.now();
        if (quick) {
          // Instant simulation skips battle arena directly to spoils
          showRewards.value = true;
        } else {
          // Watch it in the Matchzone, then the spoils.
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

  /** Book a match with `opponentId`: it kicks off on a later cup day. */
  async function bookMatch(opponentId: string): Promise<MatchdayFixture | null> {
    if (!clubId.value) return null;
    try {
      const res = await client.play.bookMatch.mutation({ params: { clubId: clubId.value }, body: { opponentId } });
      if (res.status !== 200) {
        sfx.play('error');
        toast(res.body.message, 'error');
        return null;
      }
      showMatchmaking.value = false;
      sfx.play('whistle');
      const f = res.body.payload;
      toast(`Booked: ${f.opponent.name} come to your ground on day ${f.day}. Time to prepare!`);
      return f;
    } catch (err) {
      console.error('Failed to book a match:', err);
      toast('Could not book the match.', 'error');
      return null;
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
    now, cooldownLeft, challengeLeft, coachingLevel, shopPending, shopFull, collecting, justBuilt, levelReached,
    showMatchmaking, matchmakingSearching, matchedOpponent, opponentOptions,
    showBattleArena, showRewards, matchResult, isQuickSim, bookingMode, inbox,
    snackbar, snackbarText, snackbarColor, toast,
    load, loadInbox, markInboxRead, startUpgrade, collectShop, savePlacement, findMatch, selectOpponent, startBattle, finishBattle, bookMatch,
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
