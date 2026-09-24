<template>
  <v-card class="knockout-bracket-card pa-4" elevation="3">
    <!-- Header -->
    <div class="d-flex align-center justify-space-between mb-4 flex-wrap gap-2">
      <div>
        <div class="text-overline text-indigo-lighten-2 font-weight-bold">
          Tournament Knockout Bracket
        </div>
        <div class="text-h6 font-weight-bold text-white d-flex align-center">
          <v-icon color="amber" class="mr-2">mdi-trophy-variant</v-icon>
          {{ title || 'Knockout Stages' }}
        </div>
      </div>

      <!-- Champion Banner if Final is completed -->
      <div v-if="champion" class="champion-banner d-flex align-center px-4 py-2 rounded-pill">
        <v-icon color="amber-lighten-2" class="mr-2" size="large">mdi-trophy</v-icon>
        <div>
          <div class="text-caption text-amber-lighten-3">TOURNAMENT CHAMPION</div>
          <div class="text-subtitle-1 font-weight-black text-white">
            {{ champion.Name || champion.ClubCode }}
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="!rounds.length" class="text-center py-8 text-grey">
      <v-icon size="48" color="grey">mdi-tournament</v-icon>
      <div class="mt-2 text-subtitle-1">No knockout fixtures scheduled yet</div>
    </div>

    <!-- Bracket Tree Columns -->
    <div v-else class="bracket-container d-flex gap-4 overflow-x-auto pb-4">
      <div
        v-for="(round, rIdx) in rounds"
        :key="round.name"
        class="round-column d-flex flex-column flex-shrink-0"
        :style="{ minWidth: '280px', maxWidth: '320px' }"
      >
        <!-- Round Header -->
        <div class="round-header px-3 py-2 mb-3 rounded d-flex align-center justify-space-between">
          <span class="font-weight-bold text-uppercase text-caption text-indigo-lighten-3">
            {{ round.name }}
          </span>
          <v-chip size="x-small" color="indigo" variant="flat">
            {{ round.fixtures.length }} {{ round.fixtures.length === 1 ? 'Match' : 'Matches' }}
          </v-chip>
        </div>

        <!-- Round Matches -->
        <div class="round-matches d-flex flex-column justify-space-around flex-grow-1 gap-3">
          <div
            v-for="match in round.fixtures"
            :key="match._id"
            class="match-card rounded-lg pa-3"
            :class="{
              'match-played': match.Played,
              'match-final': round.name === 'Final',
            }"
          >
            <!-- Match Meta Header -->
            <div class="d-flex align-center justify-space-between text-caption text-grey-lighten-1 mb-2">
              <span class="text-truncate mr-2 font-weight-medium">
                {{ match.Tie || match.Stage }}
              </span>
              <v-chip
                size="x-small"
                :color="match.Played ? 'success' : 'grey-darken-1'"
                variant="flat"
              >
                {{ match.Played ? 'FT' : match.ScheduledDay != null ? `Day ${match.ScheduledDay}` : 'TBD' }}
              </v-chip>
            </div>

            <!-- Home Side -->
            <div
              class="team-row d-flex align-center justify-space-between py-1 px-2 rounded mb-1"
              :class="{
                'team-winner': match.Played && isTeamWinner(match, match.HomeTeamId),
                'team-loser': match.Played && !isTeamWinner(match, match.HomeTeamId),
              }"
            >
              <div class="d-flex align-center overflow-hidden">
                <v-avatar size="20" color="grey-darken-3" class="mr-2 text-caption font-weight-bold">
                  {{ match.Home ? match.Home.substring(0, 3) : 'H' }}
                </v-avatar>
                <span class="text-body-2 text-truncate font-weight-medium">
                  {{ getTeamName(match, 'home') }}
                </span>
              </div>
              <div class="score-pill font-weight-bold ml-2">
                {{ match.Played ? (match.Details?.HomeTeamScore ?? 0) : '-' }}
              </div>
            </div>

            <!-- Away Side -->
            <div
              class="team-row d-flex align-center justify-space-between py-1 px-2 rounded"
              :class="{
                'team-winner': match.Played && isTeamWinner(match, match.AwayTeamId),
                'team-loser': match.Played && !isTeamWinner(match, match.AwayTeamId),
              }"
            >
              <div class="d-flex align-center overflow-hidden">
                <v-avatar size="20" color="grey-darken-3" class="mr-2 text-caption font-weight-bold">
                  {{ match.Away ? match.Away.substring(0, 3) : 'A' }}
                </v-avatar>
                <span class="text-body-2 text-truncate font-weight-medium">
                  {{ getTeamName(match, 'away') }}
                </span>
              </div>
              <div class="score-pill font-weight-bold ml-2">
                {{ match.Played ? (match.Details?.AwayTeamScore ?? 0) : '-' }}
              </div>
            </div>

            <!-- Penalties Note if applicable -->
            <div
              v-if="match.Played && match.Details?.Penalties"
              class="penalties-note text-caption text-amber-lighten-3 text-center mt-2 pt-1 border-t"
            >
              <v-icon size="x-small" color="amber">mdi-soccer</v-icon>
              Pens: {{ match.Details.Penalties.Home }} - {{ match.Details.Penalties.Away }}
              ({{ match.Details.Penalties.Winner }} won)
            </div>
          </div>
        </div>
      </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  fixtures: any[];
  title?: string;
  season?: any;
}>();

// Knockout stage ordering: earlier rounds have more clubs left. Cups can start
// at any 'Round of N' (a 20-24 club field starts at the Round of 32).
function stageSize(stage: string): number {
  const lower = stage.toLowerCase();
  const roundOf = /round of (\d+)/.exec(lower);
  if (roundOf) return Number(roundOf[1]);
  if (lower.includes('quarter')) return 8;
  if (lower.includes('semi')) return 4;
  if (lower.includes('final')) return 2;
  return 0;
}

function normalizeStage(stage: string): string {
  if (!stage) return 'Knockout';
  const lower = stage.toLowerCase();
  const roundOf = /round of (\d+)/.exec(lower);
  if (roundOf) return `Round of ${roundOf[1]}`;
  if (lower.includes('quarter')) return 'Quarter-Final';
  if (lower.includes('semi')) return 'Semi-Final';
  if (lower.includes('final')) return 'Final';
  return stage;
}

const rounds = computed(() => {
  if (!props.fixtures || !props.fixtures.length) return [];

  // Filter only knockout stages
  const koFixtures = props.fixtures.filter((f) => {
    const stage = (f.Stage || '').toLowerCase();
    const type = (f.Type || '').toLowerCase();
    return (
      type === 'cup' ||
      stage.includes('round') ||
      stage.includes('quarter') ||
      stage.includes('semi') ||
      stage.includes('final')
    );
  });

  const map = new Map<string, any[]>();
  for (const f of koFixtures) {
    const roundName = normalizeStage(f.Stage);
    if (!map.has(roundName)) map.set(roundName, []);
    map.get(roundName)!.push(f);
  }

  const result: { name: string; fixtures: any[] }[] = [];
  for (const [name, fixList] of map.entries()) {
    result.push({ name, fixtures: fixList });
  }

  // Sort by stage order
  result.sort(
    (a, b) =>
      (stageSize(b.name) || -1) - (stageSize(a.name) || -1)
  );
  return result;
});

const champion = computed(() => {
  const finalRound = rounds.value.find((r) => r.name === 'Final');
  const finalMatch = finalRound?.fixtures[0];
  // Details.Winner is stored as a bare club id (older data: { code, id }).
  const stored = finalMatch?.Played ? finalMatch.Details?.Winner : null;
  const winnerId = props.season?.WinnerId ?? (typeof stored === 'string' ? stored : stored?.id);
  if (!winnerId) return null;
  if (finalMatch) {
    const side = winnerId === finalMatch.HomeTeamId ? 'home' : winnerId === finalMatch.AwayTeamId ? 'away' : null;
    if (side) {
      return {
        Name: getTeamName(finalMatch, side),
        ClubCode: side === 'home' ? finalMatch.Home : finalMatch.Away,
        id: winnerId,
      };
    }
  }
  return { ClubCode: 'Champion', Name: 'Season Winner', id: winnerId };
});

function getTeamName(match: any, side: 'home' | 'away'): string {
  if (side === 'home') {
    return match.Details?.Title?.split(' vs ')?.[0] || match.Home || 'Home';
  }
  return match.Details?.Title?.split(' vs ')?.[1] || match.Away || 'Away';
}

function isTeamWinner(match: any, teamId: string): boolean {
  if (!match.Played || !match.Details) return false;
  if (match.Details.Winner?.id) {
    return String(match.Details.Winner.id) === String(teamId);
  }
  const hScore = match.Details.HomeTeamScore ?? 0;
  const aScore = match.Details.AwayTeamScore ?? 0;
  if (teamId === match.HomeTeamId) return hScore > aScore;
  return aScore > hScore;
}
</script>

<style scoped>
.knockout-bracket-card {
  background: radial-gradient(circle at top, #1a2035 0%, #0d1117 100%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
}

.champion-banner {
  background: linear-gradient(135deg, rgba(217, 119, 6, 0.3) 0%, rgba(180, 83, 9, 0.5) 100%);
  border: 1px solid #f59e0b;
  box-shadow: 0 0 15px rgba(245, 158, 11, 0.25);
}

.bracket-container {
  min-height: 480px;
}

.round-header {
  background: rgba(99, 102, 241, 0.15);
  border-left: 3px solid #6366f1;
}

.match-card {
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: transform 0.15s ease, border-color 0.15s ease;
}

.match-card:hover {
  transform: translateY(-2px);
  border-color: rgba(99, 102, 241, 0.4);
}

.match-card.match-final {
  border: 1px solid #f59e0b;
  box-shadow: 0 0 10px rgba(245, 158, 11, 0.2);
}

.team-row {
  background: rgba(15, 23, 42, 0.5);
  transition: background 0.15s ease;
}

.team-winner {
  background: rgba(34, 197, 94, 0.15);
  border-left: 3px solid #22c55e;
  color: #86efac;
}

.team-loser {
  opacity: 0.65;
}

.score-pill {
  min-width: 24px;
  text-align: center;
  font-size: 0.95rem;
}
</style>
