import { computed, ref, watch, type Ref } from 'vue';
import type {
  Campus,
  OwnerProgramStep,
  PlayState,
  ProgramLoan,
  ProgramManager,
  ProgramManagerList,
  ProgramPlayer,
  ProgramPlayerList,
  ProgramScoutReveal,
  ProgramState,
  TransferWindow,
  Player as MarketPlayer,
} from '@repo/api-contract';
import { formatVilla } from '@repo/api-contract';
import { client } from '@/services/api';
import {
  advanceProgram,
  dismissTip,
  fetchFreeAgents,
  fetchManagerMarket,
  fetchProgramState,
  interviewManager,
  requestBoardAdvance,
  scoutFreeAgent,
  signFreeAgent,
  signManager,
} from '@/services/program';

export interface CompletedStep {
  step: OwnerProgramStep;
  stars: number;
  xp: number;
  reasons: string[];
}

/** The four guided steps, in order, plus the pre-step balance reveal. */
export const PROGRAM_STEPS: { key: OwnerProgramStep; label: string; blurb: string }[] = [
  { key: 'manager', label: 'Manager', blurb: 'The voice on the training pitch' },
  { key: 'players', label: 'Squad', blurb: 'Eleven and a keeper' },
  { key: 'facilities', label: 'Facilities', blurb: 'Build one Tier 1' },
  { key: 'level1', label: 'Level 1', blurb: 'Earn the league place' },
];

const STEP_ORDER: Record<string, number> = { not_started: -1, manager: 0, players: 1, facilities: 2, level1: 3, done: 4 };

/**
 * State and actions for the owner program screens (phase-2 OWNER-PROGRAM-SPEC
 * §3-§4). One composable for the whole flow: it reads the server's program
 * state, the manager and free-agent markets, the campus and the play state,
 * and exposes the money-write actions. The server owns every fact; the client
 * only asks and renders.
 */
export function useOwnerProgram(clubIdInput: Ref<string> | string) {
  const clubId = computed(() => (typeof clubIdInput === 'string' ? clubIdInput : clubIdInput.value));

  const state = ref<ProgramState | null>(null);
  const managers = ref<ProgramManagerList | null>(null);
  const players = ref<ProgramPlayerList | null>(null);
  const campus = ref<Campus | null>(null);
  const playState = ref<PlayState | null>(null);
  /** The club row with its roster, for the squad meter's counts. */
  const club = ref<{ Name?: string; ClubCode?: string; Players?: Array<{ Position?: string | null; isRetired?: boolean }> } | null>(null);
  const transferWindow = ref<TransferWindow | null>(null);
  const otherPlayers = ref<MarketPlayer[]>([]);

  const loading = ref(false);
  const busy = ref<string | null>(null);
  const error = ref<string | null>(null);
  const toast = ref<{ text: string; bad: boolean } | null>(null);

  /** The step just completed, for the star reveal moment. */
  const justCompleted = ref<CompletedStep | null>(null);

  const budget = computed(() => state.value?.budget ?? campus.value?.budget ?? 0);
  const step = computed<OwnerProgramStep>(() => state.value?.step ?? 'manager');
  const isActive = computed(() => !!state.value && !['done'].includes(state.value.step));
  const stepIndex = computed(() => STEP_ORDER[step.value] ?? 0);
  const advisor = computed(() => state.value?.advisor ?? null);
  const legalSquad = computed(() => {
    const list = players.value;
    if (list) return list.needed === 0;
    return false;
  });

  /** Roster counts from the club's populated Players (squad meter). */
  const squadCount = computed(() => (club.value?.Players ?? []).filter((p) => !p.isRetired).length);
  const gkCount = computed(
    () => (club.value?.Players ?? []).filter((p) => !p.isRetired && (p.Position ?? '').toUpperCase() === 'GK').length
  );

  function say(text: string, bad = false) {
    toast.value = { text, bad };
    window.setTimeout(() => {
      if (toast.value?.text === text) toast.value = null;
    }, 3200);
  }

  async function load(): Promise<void> {
    if (!clubId.value) return;
    loading.value = true;
    error.value = null;
    try {
      const [programRes, campusRes, playRes, clubRes] = await Promise.all([
        fetchProgramState(clubId.value),
        client.facilities.getCampus.query({ params: { clubId: clubId.value } }),
        client.play.getPlayState.query({ params: { clubId: clubId.value } }),
        client.clubs.getClub.query({ params: { id: clubId.value }, query: { populate: 'true' } }),
      ]);
      state.value = programRes;
      if (campusRes.status === 200) campus.value = campusRes.body.payload;
      if (playRes.status === 200) playState.value = playRes.body.payload;
      if (clubRes.status === 200) club.value = clubRes.body.payload as typeof club.value;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Could not load the owner program';
    } finally {
      loading.value = false;
    }
  }

  async function loadManagers(): Promise<void> {
    if (!clubId.value) return;
    try {
      managers.value = await fetchManagerMarket(clubId.value);
    } catch (err) {
      say(err instanceof Error ? err.message : 'Could not load the manager market', true);
    }
  }

  async function loadPlayers(): Promise<void> {
    if (!clubId.value) return;
    try {
      players.value = await fetchFreeAgents(clubId.value);
    } catch (err) {
      say(err instanceof Error ? err.message : 'Could not load the free-agent market', true);
    }
  }

  /** The transfer market reuses the existing players/transfer endpoints. */
  async function loadTransferMarket(): Promise<void> {
    if (!clubId.value) return;
    try {
      const [windowRes, marketRes] = await Promise.all([
        client.transfers.getTransferWindow.query(),
        client.players.getPlayers.query({ query: { isSigned: true, excludeClubId: clubId.value } }),
      ]);
      if (windowRes.status === 200) transferWindow.value = windowRes.body.payload;
      if (marketRes.status === 200) otherPlayers.value = marketRes.body.payload;
    } catch {
      // The transfer market is a secondary path for a Level-0 club; a failure
      // here must not block the free-agent route.
    }
  }

  async function refreshMarkets(): Promise<void> {
    await Promise.all([loadManagers(), loadPlayers()]);
  }

  /** Re-check the predicate and advance one step, capturing the star reveal. */
  async function advance(): Promise<void> {
    if (!clubId.value) return;
    const before = state.value;
    busy.value = 'advance';
    try {
      const next = await advanceProgram(clubId.value);
      // The step that was active is the one that completed.
      if (before && next.step !== before.step && next.stars > 0) {
        justCompleted.value = { step: before.step, stars: next.stars, xp: next.xp, reasons: next.reasons };
      }
      state.value = next;
    } catch (err) {
      say(err instanceof Error ? err.message : 'Could not advance the program', true);
    } finally {
      busy.value = null;
    }
  }

  async function doInterview(manager: ProgramManager): Promise<void> {
    if (!clubId.value) return;
    busy.value = `interview:${manager.id}`;
    try {
      const reveal = await interviewManager(clubId.value, manager.id);
      applyManagerReveal(manager.id, reveal);
      if (state.value) state.value.budget = Math.max(0, state.value.budget - (managers.value?.interviewFee ?? 0));
      if (managers.value) managers.value.budget = state.value?.budget ?? managers.value.budget;
      say(`Interviewed ${manager.firstName} ${manager.lastName} — the full picture, and 10% off the fee.`);
    } catch (err) {
      say(err instanceof Error ? err.message : 'Interview failed', true);
    } finally {
      busy.value = null;
    }
  }

  function applyManagerReveal(id: string, reveal: ProgramScoutReveal): void {
    const list = managers.value;
    if (!list) return;
    list.managers = list.managers.map((m) => {
      if (m.id !== id || !reveal.managers) return m;
      const r = reveal.managers;
      return {
        ...m,
        interviewed: true,
        overall: { low: r.overall, high: r.overall },
        tactics: { low: r.tactics, high: r.tactics },
        motivation: { low: r.motivation, high: r.motivation },
        development: { low: r.development, high: r.development },
        discipline: { low: r.discipline, high: r.discipline },
        signingFee: r.signingFee,
        effectiveFee: Math.round(r.signingFee * 0.9),
        wage: r.wage,
      };
    });
  }

  async function doSignManager(manager: ProgramManager, contractYears: number): Promise<void> {
    if (!clubId.value) return;
    busy.value = `sign-manager:${manager.id}`;
    try {
      const result = await signManager(clubId.value, manager.id, contractYears);
      state.value = result.state;
      say(`${manager.firstName} ${manager.lastName} signs as your manager for ${contractYears} year${contractYears > 1 ? 's' : ''}.`);
    } catch (err) {
      say(err instanceof Error ? err.message : 'Could not sign the manager', true);
    } finally {
      busy.value = null;
    }
  }

  async function doScout(player: ProgramPlayer): Promise<void> {
    if (!clubId.value) return;
    busy.value = `scout:${player.id}`;
    try {
      const reveal = await scoutFreeAgent(clubId.value, player.id);
      const list = players.value;
      if (list && reveal.players) {
        const r = reveal.players;
        list.players = list.players.map((p) =>
          p.id === player.id
            ? { ...p, scouted: true, rating: { low: r.rating, high: r.rating }, value: r.value, wage: r.wage }
            : p
        );
      }
      if (state.value && list) {
        state.value.budget = Math.max(0, state.value.budget - list.scoutFee);
        list.budget = state.value.budget;
      }
      say(`Scouted ${player.firstName} ${player.lastName} — the range was hiding the truth.`);
    } catch (err) {
      say(err instanceof Error ? err.message : 'Scouting failed', true);
    } finally {
      busy.value = null;
    }
  }

  async function doSignFreeAgent(player: ProgramPlayer): Promise<void> {
    if (!clubId.value) return;
    busy.value = `sign-player:${player.id}`;
    try {
      const result = await signFreeAgent(clubId.value, player.id);
      state.value = result.state;
      say(`${player.firstName} ${player.lastName} joins for ${formatVilla(player.value)}.`);
      await loadPlayers();
    } catch (err) {
      say(err instanceof Error ? err.message : 'Could not sign the player', true);
    } finally {
      busy.value = null;
    }
  }

  /** Buy a player from another club through the existing transfer market. */
  async function doBuyPlayer(player: MarketPlayer): Promise<void> {
    if (!clubId.value) return;
    if (!player._id) return;
    if (transferWindow.value && !transferWindow.value.open) {
      say('The transfer window is closed — free agents are still available.', true);
      return;
    }
    busy.value = `buy:${player._id}`;
    try {
      const res = await client.transfers.purchasePlayer.mutation({
        body: { playerId: player._id, buyingClubId: clubId.value, offerAmount: player.Value },
      });
      if (res.status !== 200) throw new Error(res.body.message);
      say(`${player.FirstName} ${player.LastName} bought for ${formatVilla(player.Value)}.`);
      await Promise.all([loadTransferMarket(), loadPlayers(), load()]);
    } catch (err) {
      say(err instanceof Error ? err.message : 'Transfer failed', true);
    } finally {
      busy.value = null;
    }
  }

  /** Build a Tier-1 facility through the existing facilities endpoint. */
  async function doBuild(assetType: string): Promise<void> {
    if (!clubId.value) return;
    busy.value = `build:${assetType}`;
    try {
      const res = await client.facilities.startUpgrade.mutation({
        params: { clubId: clubId.value },
        body: { assetType },
      });
      if (res.status !== 200) throw new Error(res.body.message);
      campus.value = res.body.payload;
      say('Builders on site — the Tier 1 goes up while you work.');
    } catch (err) {
      say(err instanceof Error ? err.message : 'Could not start the build', true);
    } finally {
      busy.value = null;
    }
  }

  async function doBoardAdvance(): Promise<void> {
    if (!clubId.value) return;
    busy.value = 'loan';
    try {
      const loan: ProgramLoan = await requestBoardAdvance(clubId.value);
      state.value = loan.state;
      say(loan.granted ? `The board advanced you ${formatVilla(loan.amount)}.` : 'The board refused this time.');
    } catch (err) {
      say(err instanceof Error ? err.message : 'The board refused', true);
    } finally {
      busy.value = null;
    }
  }

  async function doDismissTip(tipId: string): Promise<void> {
    if (!clubId.value) return;
    try {
      await dismissTip(clubId.value, tipId);
      if (state.value) state.value.advisor = null;
    } catch {
      // Dismissal is a nicety.
    }
  }

  // Load the current step's data whenever the step changes.
  watch(
    () => state.value?.step,
    (s) => {
      if (s === 'manager') void loadManagers();
      if (s === 'players') {
        void loadPlayers();
        void loadTransferMarket();
      }
    },
    { immediate: false }
  );

  return {
    clubId,
    state,
    managers,
    players,
    campus,
    playState,
    transferWindow,
    otherPlayers,
    loading,
    busy,
    error,
    toast,
    justCompleted,
    budget,
    step,
    isActive,
    stepIndex,
    advisor,
    legalSquad,
    club,
    squadCount,
    gkCount,
    say,
    load,
    loadManagers,
    loadPlayers,
    loadTransferMarket,
    refreshMarkets,
    advance,
    doInterview,
    doSignManager,
    doScout,
    doSignFreeAgent,
    doBuyPlayer,
    doBuild,
    doBoardAdvance,
    doDismissTip,
  };
}

export type OwnerProgram = ReturnType<typeof useOwnerProgram>;
