<template>
  <div class="group-stage-container">
    <div class="d-flex align-center justify-space-between mb-4 flex-wrap gap-2">
      <div>
        <div class="text-overline text-indigo-lighten-2 font-weight-bold">
          Continental Champions League
        </div>
        <div class="text-h6 font-weight-bold text-white d-flex align-center">
          <v-icon color="indigo-lighten-2" class="mr-2">mdi-view-grid</v-icon>
          Group Stage Standings
        </div>
      </div>
      <div class="d-flex align-center gap-2">
        <v-chip size="small" color="success" variant="tonal" prepend-icon="mdi-check-circle">
          Top 2 Advance to Quarter-Finals
        </v-chip>
      </div>
    </div>

    <!-- Groups Grid (2x2) -->
    <v-row>
      <v-col
        v-for="group in groupData"
        :key="group.letter"
        cols="12"
        md="6"
      >
        <v-card class="group-card pa-3" elevation="2">
          <!-- Group Header -->
          <div class="d-flex align-center justify-space-between mb-2 px-1">
            <div class="d-flex align-center">
              <v-avatar size="28" color="indigo-darken-3" class="mr-2 font-weight-black text-caption">
                {{ group.letter }}
              </v-avatar>
              <span class="font-weight-bold text-subtitle-1 text-white">
                Group {{ group.letter }}
              </span>
            </div>
            <v-chip size="x-small" color="indigo-lighten-2" variant="flat">
              4 Clubs
            </v-chip>
          </div>

          <!-- Standings Table -->
          <v-table density="compact" class="group-table bg-transparent">
            <thead>
              <tr>
                <th class="text-left" style="width: 36px">#</th>
                <th class="text-left">Club</th>
                <th class="text-center" style="width: 32px">P</th>
                <th class="text-center" style="width: 32px">W</th>
                <th class="text-center" style="width: 32px">D</th>
                <th class="text-center" style="width: 32px">L</th>
                <th class="text-center" style="width: 36px">GD</th>
                <th class="text-center font-weight-black" style="width: 40px">PTS</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, idx) in group.table"
                :key="row.ClubCode"
                :class="{
                  'qualified-row': idx < 2,
                }"
              >
                <!-- Rank -->
                <td class="text-left font-weight-medium">
                  <span v-if="idx < 2" class="qualified-badge mr-1">Q</span>
                  {{ idx + 1 }}
                </td>

                <!-- Club -->
                <td class="text-left text-truncate font-weight-medium text-white">
                  {{ row.ClubCode }}
                </td>

                <!-- P, W, D, L, GD, PTS -->
                <td class="text-center text-caption">{{ row.Played }}</td>
                <td class="text-center text-caption">{{ row.Wins }}</td>
                <td class="text-center text-caption">{{ row.Draws }}</td>
                <td class="text-center text-caption">{{ row.Losses }}</td>
                <td
                  class="text-center text-caption font-weight-medium"
                  :class="row.GD > 0 ? 'text-green' : row.GD < 0 ? 'text-red-lighten-1' : 'text-grey'"
                >
                  {{ row.GD > 0 ? `+${row.GD}` : row.GD }}
                </td>
                <td class="text-center font-weight-black text-amber-lighten-2">
                  {{ row.Points }}
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  standings?: any[];
  fixtures?: any[];
}>();

interface GroupTableItem {
  ClubCode: string;
  ClubID?: string;
  Played: number;
  Wins: number;
  Draws: number;
  Losses: number;
  GF: number;
  GA: number;
  GD: number;
  Points: number;
}

const groupData = computed(() => {
  const letters = ['A', 'B', 'C', 'D'];

  // If season.Standings has group items: [{ Group: 'A', Table: [...] }, ...]
  if (props.standings && props.standings.length > 0 && props.standings[0]?.Group) {
    return letters.map((letter) => {
      const found = props.standings!.find((g: any) => g.Group === letter);
      const rawTable: GroupTableItem[] = found?.Table ?? [];

      // Sort table by PTS, GD, GF
      const sorted = [...rawTable].sort((a, b) => {
        if (b.Points !== a.Points) return b.Points - a.Points;
        if (b.GD !== a.GD) return b.GD - a.GD;
        return b.GF - a.GF;
      });

      return { letter, table: sorted };
    });
  }

  // Fallback: dynamically compute from props.fixtures if stage is "Group X"
  if (props.fixtures && props.fixtures.length > 0) {
    return letters.map((letter) => {
      const gFixtures = props.fixtures!.filter(
        (f) => f.Stage === `Group ${letter}` || (f.Tie && f.Tie.includes(`Group ${letter}`))
      );

      const map = new Map<string, GroupTableItem>();

      for (const f of gFixtures) {
        const hCode = f.Home || 'Home';
        const aCode = f.Away || 'Away';
        if (!map.has(hCode)) {
          map.set(hCode, {
            ClubCode: hCode,
            ClubID: f.HomeTeamId,
            Played: 0,
            Wins: 0,
            Draws: 0,
            Losses: 0,
            GF: 0,
            GA: 0,
            GD: 0,
            Points: 0,
          });
        }
        if (!map.has(aCode)) {
          map.set(aCode, {
            ClubCode: aCode,
            ClubID: f.AwayTeamId,
            Played: 0,
            Wins: 0,
            Draws: 0,
            Losses: 0,
            GF: 0,
            GA: 0,
            GD: 0,
            Points: 0,
          });
        }

        if (f.Played && f.Details) {
          const hItem = map.get(hCode)!;
          const aItem = map.get(aCode)!;
          const hScore = Number(f.Details.HomeTeamScore ?? 0);
          const aScore = Number(f.Details.AwayTeamScore ?? 0);

          hItem.Played++;
          aItem.Played++;
          hItem.GF += hScore;
          hItem.GA += aScore;
          hItem.GD += hScore - aScore;
          aItem.GF += aScore;
          aItem.GA += hScore;
          aItem.GD += aScore - hScore;

          if (hScore > aScore) {
            hItem.Wins++;
            hItem.Points += 3;
            aItem.Losses++;
          } else if (aScore > hScore) {
            aItem.Wins++;
            aItem.Points += 3;
            hItem.Losses++;
          } else {
            hItem.Draws++;
            aItem.Draws++;
            hItem.Points += 1;
            aItem.Points += 1;
          }
        }
      }

      const sorted = Array.from(map.values()).sort((a, b) => {
        if (b.Points !== a.Points) return b.Points - a.Points;
        if (b.GD !== a.GD) return b.GD - a.GD;
        return b.GF - a.GF;
      });

      return { letter, table: sorted };
    });
  }

  return letters.map((letter) => ({ letter, table: [] }));
});
</script>

<style scoped>
.group-card {
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
}

.group-table th {
  color: #94a3b8 !important;
  font-size: 0.75rem !important;
  text-transform: uppercase;
}

.qualified-row {
  background: rgba(34, 197, 94, 0.08);
}

.qualified-badge {
  display: inline-block;
  font-size: 0.65rem;
  font-weight: 800;
  background: #22c55e;
  color: #052e16;
  border-radius: 3px;
  padding: 0 3px;
}
</style>
