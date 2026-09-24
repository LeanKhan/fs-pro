import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import type {
  EditionListItem,
  Entry,
  MatchChallenge,
  PerformanceView,
  WorldSettings,
} from '@repo/api-contract';
import { client } from '@/services/api';
import { useStore } from '@/store';

/**
 * Open-play state shared by the dashboard, the world view and the
 * competitions pages (docs/OPEN-PLAY-COMPETITIONS-SPEC.md, "UI"): the user's
 * club, its entries and challenges, the world settings and its performance.
 * Refreshed every minute and whenever the window regains focus.
 */

export type ClubEntry = Entry & { edition: EditionListItem };

/** Throws the server's message for any non-2xx ts-rest response. */
export function unwrap<T>(response: { status: number; body: unknown }): T {
  const body = response.body as { success?: boolean; message?: string; payload?: unknown };
  if (response.status >= 200 && response.status < 300 && body?.success !== false) return body.payload as T;
  const reasons = Array.isArray(body?.payload) ? (body.payload as unknown[]).filter((r) => typeof r === 'string') : [];
  const err = new Error(body?.message || `Request failed (${response.status})`) as Error & { reasons?: string[] };
  err.reasons = reasons as string[];
  throw err;
}

const POLL_MS = 60_000;

export const useOpenPlayStore = defineStore('open-play', () => {
  const main = useStore();

  const settings = ref<WorldSettings | null>(null);
  const entries = ref<ClubEntry[]>([]);
  const challenges = ref<MatchChallenge[]>([]);
  const performance = ref<PerformanceView | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;
  // Screens call start() on mount and stop() on unmount; polling runs while
  // at least one of them is open.
  let users = 0;

  /** The user's (first) club id, or null. */
  const clubId = computed<string | null>(() => {
    const first = main.user?.clubs?.[0];
    if (!first) return null;
    return typeof first === 'string' ? first : ((first as { _id?: string })._id ?? null);
  });

  const activeEntries = computed(() =>
    entries.value.filter(
      (e) =>
        ['registered', 'active', 'invited'].includes(e.status) &&
        ['draft', 'registration', 'running'].includes(e.edition.status)
    )
  );
  const entriesUsed = computed(
    () => activeEntries.value.filter((e) => e.status !== 'invited').length
  );
  const incoming = computed(() =>
    challenges.value.filter((c) => c.direction === 'incoming' && c.status === 'proposed')
  );
  const outgoing = computed(() =>
    challenges.value.filter((c) => c.direction === 'outgoing' && c.status === 'proposed')
  );
  const upcoming = computed(() =>
    challenges.value.filter((c) => c.status === 'accepted' && !c.played)
  );
  const history = computed(() =>
    challenges.value.filter((c) => !['proposed', 'accepted'].includes(c.status ?? '') || c.played)
  );

  async function loadSettings() {
    settings.value = unwrap<WorldSettings>(await client.world.getSettings.query());
  }

  async function loadClub() {
    const id = clubId.value;
    if (!id) return;
    const [e, c, p] = await Promise.all([
      client.editions.clubEntries.query({ params: { clubId: id } }),
      client.challenges.forClub.query({ params: { clubId: id }, query: {} }),
      client.world.performance.query({ params: { clubId: id }, query: {} }),
    ]);
    entries.value = unwrap<ClubEntry[]>(e);
    challenges.value = unwrap<MatchChallenge[]>(c);
    try {
      performance.value = unwrap<PerformanceView>(p);
    } catch {
      performance.value = null;
    }
  }

  async function refresh() {
    loading.value = true;
    error.value = null;
    try {
      await Promise.all([loadSettings(), loadClub()]);
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  // The user (and so the club) can load after a screen has started polling.
  watch(clubId, (id, old) => {
    if (id && id !== old && timer) void refresh();
  });

  const onFocus = () => void refresh();
  function start() {
    users++;
    if (timer) return;
    void refresh();
    timer = setInterval(() => void refresh(), POLL_MS);
    window.addEventListener('focus', onFocus);
  }
  function stop() {
    users = Math.max(0, users - 1);
    if (users > 0) return;
    if (timer) clearInterval(timer);
    timer = null;
    window.removeEventListener('focus', onFocus);
  }

  // Actions -----------------------------------------------------------------

  async function propose(editionId: string, opponentClubId: string) {
    const id = clubId.value;
    if (!id) throw new Error('You have no club');
    const result = unwrap<MatchChallenge>(
      await client.challenges.propose.mutation({
        body: { editionId, challengerClubId: id, opponentClubId },
      })
    );
    await loadClub();
    return result;
  }

  async function respond(fixtureId: string, action: 'accept' | 'decline' | 'cancel') {
    const id = clubId.value;
    if (!id) throw new Error('You have no club');
    const result = unwrap<{ challenge: MatchChallenge; forfeited?: boolean }>(
      await client.challenges.respond.mutation({
        params: { fixtureId, action },
        body: { clubId: id },
      })
    );
    await loadClub();
    return result;
  }

  async function register(editionId: string) {
    const id = clubId.value;
    if (!id) throw new Error('You have no club');
    const result = unwrap<Entry>(
      await client.editions.register.mutation({ params: { id: editionId, clubId: id }, body: {} })
    );
    await loadClub();
    return result;
  }

  async function withdraw(editionId: string) {
    const id = clubId.value;
    if (!id) throw new Error('You have no club');
    unwrap(await client.editions.withdraw.mutation({ params: { id: editionId, clubId: id }, body: {} }));
    await loadClub();
  }

  return {
    settings,
    entries,
    challenges,
    performance,
    loading,
    error,
    clubId,
    activeEntries,
    entriesUsed,
    incoming,
    outgoing,
    upcoming,
    history,
    refresh,
    start,
    stop,
    propose,
    respond,
    register,
    withdraw,
  };
});
