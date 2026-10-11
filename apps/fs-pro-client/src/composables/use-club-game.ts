import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Ref,
} from 'vue';
import type {
  AssetState,
  Campus,
  CampusPlacement,
  CampusState,
  DefenseEntry,
  MatchResult,
  Opponent,
  PlayState,
} from '@repo/api-contract';
import { client } from '@/services/api';
import { sfx } from '@/services/sfx';

/**
 * State and actions for the club game screen (views/game/club-game.vue):
 * play state, the campus layout + the CoC campus economy (Cash/Fans/Tokens,
 * vaults, collectors, builders), a 1s ticker for countdowns, facility
 * upgrades and the attack flow (matchmaking -> raid -> rewards).
 */
export function useClubGame(
  clubId: Ref<string | undefined>,
  onChanged?: () => void
) {
  const playState = ref<PlayState | null>(null);
  const campus = ref<Campus | null>(null);
  /** The CoC campus economy (docs/coc-mapping/04): resources, vaults, collectors. */
  const economy = ref<CampusState | null>(null);
  const loading = ref(false);
  const playing = ref(false);
  const upgradingAsset = ref<string | null>(null);

  // Matchmaking / result dialogs
  const showMatchmaking = ref(false);
  const matchmakingSearching = ref(false);
  const matchedOpponent = ref<{
    id?: string;
    name: string;
    power: number;
    code?: string;
  } | null>(null);
  const matchedOpponentId = ref<string | null>(null);
  const opponentOptions = ref<Opponent[]>([]);
  const showBattleArena = ref(false);
  const showRewards = ref(false);
  const matchResult = ref<MatchResult | null>(null);
  /** Raids against this club, newest first (owner only). */
  const defences = ref<DefenseEntry[]>([]);

  const coachingLevel = computed(() => {
    const staff = campus.value?.assets.find(
      (a: AssetState) => a.type === 'staff_house'
    );
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
  const elapsed = computed(() =>
    Math.max(Math.floor((now.value - loadedAt.value) / 1000), 0)
  );
  const cooldownLeft = computed(() =>
    Math.max((playState.value?.cooldownSeconds ?? 0) - elapsed.value, 0)
  );
  const economyLoadedAt = ref(Date.now());
  /** Collectors' takings, ticking up between fetches (campus.collectors). */
  const pendingByCurrency = computed(() => {
    const out = { cash: 0, fans: 0 };
    const eco = economy.value;
    if (!eco) return out;
    const since = Math.max(0, (now.value - economyLoadedAt.value) / 1000);
    for (const c of eco.collectors) {
      if (c.currency !== 'cash' && c.currency !== 'fans') continue;
      out[c.currency] += Math.min(c.capacity, c.pending + (c.productionPerHour * since) / 3600);
    }
    return { cash: Math.floor(out.cash), fans: Math.floor(out.fans) };
  });
  const collectorsFull = computed(
    () => !!economy.value?.collectors.some((c) => c.full)
  );
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
      const [playRes, campusRes, ecoRes] = await Promise.all([
        client.play.getPlayState.query({ params: { clubId: clubId.value } }),
        client.facilities.getCampus.query({ params: { clubId: clubId.value } }),
        client.campus.get.query({ params: { clubId: clubId.value } }),
      ]);
      if (ecoRes.status === 200) {
        const was = new Map(
          (economy.value?.assets ?? []).map((a) => [a.type, a.level])
        );
        economy.value = ecoRes.body.payload;
        economyLoadedAt.value = Date.now();
        if (was.size) {
          // Campus keys: the Clubhouse lives in the Office building.
          const built = ecoRes.body.payload.assets
            .filter((a) => a.level > (was.get(a.type) ?? a.level))
            .map((a) => (a.type === 'clubhouse' ? 'office' : a.type));
          if (built.length) justBuilt.value = [...justBuilt.value, ...built];
        }
      }
      if (playRes.status === 200) {
        const before = playState.value?.club.level;
        playState.value = playRes.body.payload;
        loadedAt.value = Date.now();
        if (before !== undefined && playRes.body.payload.club.level > before)
          levelReached.value = playRes.body.payload.club.level;
      }
      if (campusRes.status === 200) {
        const was = new Map(
          (campus.value?.assets ?? []).map((a) => [a.type, a.level])
        );
        campus.value = campusRes.body.payload;
        if (was.size) {
          const built = campusRes.body.payload.assets
            .filter((a) => a.level > (was.get(a.type) ?? a.level))
            .map((a) => a.type);
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

  /** Owner-only; a non-owner just gets an empty log. */
  async function loadDefences() {
    if (!clubId.value) return;
    try {
      const res = await client.play.defenseLog.query({
        params: { clubId: clubId.value },
      });
      if (res.status === 200) defences.value = res.body.payload.defenses;
    } catch (err) {
      console.error('Failed to load the defence log:', err);
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
  /** Start a campus-economy upgrade (Clubhouse, collectors, vaults, research):
   * the crossed-currency cost is paid by the server (campus.upgrade). */
  async function startEcoUpgrade(assetType: string) {
    if (!clubId.value) return;
    upgradingAsset.value = assetType;
    try {
      const res = await client.campus.upgrade.mutation({
        params: { clubId: clubId.value },
        body: { assetType },
      });
      if (res.status === 200) {
        economy.value = res.body.payload;
        economyLoadedAt.value = Date.now();
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

  /** Hire the next Groundskeeper (a builder slot). */
  async function hireBuilder() {
    if (!clubId.value) return;
    const res = await client.campus.buyGroundskeeper.mutation({
      params: { clubId: clubId.value },
      body: {},
    });
    if (res.status === 200) {
      economy.value = res.body.payload;
      economyLoadedAt.value = Date.now();
      sfx.play('complete');
      toast('A new builder joined the club!');
    } else {
      sfx.play('error');
      toast(res.body.message, 'error');
    }
  }

  async function savePlacement(placement: CampusPlacement) {
    if (!clubId.value) return false;
    const res = await client.facilities.savePlacement.mutation({
      params: { clubId: clubId.value },
      body: { placement },
    });
    if (res.status === 200) {
      campus.value = res.body.payload;
      toast('Layout saved');
      return true;
    }
    toast(res.body.message, 'error');
    return false;
  }

  /** Collect every collector in one tap (campus.collect). Resolves to what
   * was banked per currency, or null when nothing was. */
  const collecting = ref(false);
  async function collectAll(): Promise<{ cash: number; fans: number } | null> {
    if (!clubId.value || collecting.value || !economy.value) return null;
    collecting.value = true;
    const before = { cash: economy.value.cash, fans: economy.value.fans };
    try {
      const res = await client.campus.collect.mutation({
        params: { clubId: clubId.value },
        body: {},
      });
      if (res.status !== 200) {
        if (res.status !== 409) toast(res.body.message, 'error');
        return null;
      }
      economy.value = res.body.payload;
      economyLoadedAt.value = Date.now();
      return {
        cash: Math.max(0, res.body.payload.cash - before.cash),
        fans: Math.max(0, res.body.payload.fans - before.fans),
      };
    } catch (err) {
      console.error('Failed to collect:', err);
      toast('Could not collect.', 'error');
      return null;
    } finally {
      collecting.value = false;
    }
  }

  function selectOpponent(opp: {
    id: string;
    name: string;
    power: number;
    code?: string;
  }) {
    matchedOpponent.value = opp;
    matchedOpponentId.value = opp.id;
  }

  const isQuickSim = ref(false);

  /** Attack pressed: ask the server for real opponents, then wait for "battle". */
  async function findMatch(quickSim = false) {
    if (!clubId.value || playing.value || cooldownLeft.value > 0) return;
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
        toast(
          res.status === 200
            ? 'No opponent available right now'
            : res.body.message,
          'error'
        );
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
    const quick =
      overrideQuickSim !== undefined ? overrideQuickSim : isQuickSim.value;
    playing.value = true;
    try {
      const res = await client.play.playMatch.mutation({
        params: { clubId: clubId.value },
        // Watching records the replay the Matchzone plays; quick sim doesn't.
        body: {
          ...(matchedOpponentId.value
            ? { opponentId: matchedOpponentId.value }
            : {}),
          watch: !quick,
        },
      });
      if (res.status === 200) {
        showMatchmaking.value = false;
        matchResult.value = res.body.payload;
        const before = playState.value?.club.level;
        playState.value = res.body.payload.state;
        if (before !== undefined && res.body.payload.state.club.level > before)
          levelReached.value = res.body.payload.state.club.level;
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
        // The PLAY gate (no manager / no keeper / no squad) and the cooldown
        // arrive as a declared 409; keep the dialog open so the player can
        // read why and act on it (U-06).
        sfx.play('error');
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
  // Throttled, so an upgrade the server has not promoted yet is not polled
  // every second.
  let refreshing = false;
  let lastRefresh = 0;
  watch(now, () => {
    const done =
      campus.value?.assets.some(
        (a: AssetState) =>
          a.upgrade && new Date(a.upgrade.completeAt).getTime() <= now.value
      ) ||
      economy.value?.assets.some(
        (a) => a.upgrade && Date.parse(a.upgrade.readyAt) <= now.value
      );
    if (done && !refreshing && now.value - lastRefresh > 5000) {
      refreshing = true;
      lastRefresh = now.value;
      load().finally(() => (refreshing = false));
    }
  });

  watch(clubId, load, { immediate: true });
  onMounted(() => {
    timer = setInterval(() => (now.value = Date.now()), 1000);
  });
  onBeforeUnmount(() => timer && clearInterval(timer));

  return {
    playState,
    campus,
    loading,
    playing,
    upgradingAsset,
    now,
    cooldownLeft,
    challengeLeft,
    coachingLevel,
    economy,
    pendingByCurrency,
    collectorsFull,
    collecting,
    justBuilt,
    levelReached,
    showMatchmaking,
    matchmakingSearching,
    matchedOpponent,
    opponentOptions,
    showBattleArena,
    showRewards,
    matchResult,
    isQuickSim,
    defences,
    snackbar,
    snackbarText,
    snackbarColor,
    toast,
    load,
    loadDefences,
    startUpgrade,
    startEcoUpgrade,
    hireBuilder,
    collectAll,
    savePlacement,
    findMatch,
    selectOpponent,
    startBattle,
    finishBattle,
  };
}
