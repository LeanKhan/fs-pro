import { ref } from 'vue';
import { client } from '@/services/api';

export const STAT_ATTRIBUTES = ['points', 'goals', 'assists', 'saves'] as const;
export type StatAttribute = (typeof STAT_ATTRIBUTES)[number];

/** Top-5-by-stat player leaderboard, shared by the season-stats and
 * end-of-season screens (previously two near-identical copies of this
 * fetch). The server only supports scoping by Competition (`competitionCode`),
 * not by a specific Season, so `competitionCode` is the closest honest
 * filter available - pass the season's own CompetitionCode. The old
 * `match_k`/`match_v`/`sort_k`/`sort_v` query params these two screens sent
 * were dead (the real route never read them), so every "Highest X" card
 * was silently showing the same global top-5-by-points regardless of which
 * button was clicked - fixed by actually wiring `sortBy` to the clicked
 * attribute. */
export function usePlayerStats() {
  const loading = ref(false);
  const topPlayers = ref<Record<StatAttribute, any[]>>({
    points: [],
    goals: [],
    assists: [],
    saves: [],
  });

  async function loadStats(attribute: StatAttribute, competitionCode?: string) {
    loading.value = true;
    try {
      const response = await client.players.getPlayerStats.query({
        query: { sortBy: attribute, competitionCode },
      });
      if (response.status === 200) {
        topPlayers.value[attribute] = response.body.payload;
      }
    } catch (error) {
      console.error(`Error fetching player with most ${attribute}:`, error);
    } finally {
      loading.value = false;
    }
  }

  return { topPlayers, loading, loadStats };
}
