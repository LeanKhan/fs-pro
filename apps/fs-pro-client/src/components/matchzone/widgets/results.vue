<template>
  <div>
    <!-- For the stats gan -->
    <v-table v-if="matchDetails">
      <tbody>
        <tr>
          <td>
            <v-avatar tile size="30">
              <v-icon style="font-size: 30px; height: 30px" size="large">
                custom:{{ home }}
              </v-icon>
            </v-avatar>
          </td>

          <td>-</td>

          <td>
            <v-avatar tile size="30">
              <v-icon style="font-size: 30px; height: 30px" size="large">
                custom:{{ away }}
              </v-icon>
            </v-avatar>
          </td>
        </tr>
        <tr class="pa-0" v-for="(stat, i) in statLabels" :key="i">
          <td class="pa-0">
            {{ matchDetails.Home[stat.key] }}
          </td>

          <td class="font-weight-bold text-body-2 text-white text-center pa-0">
            {{ stat.label }}
          </td>

          <td class="pa-0">
            {{ matchDetails.Away[stat.key] }}
          </td>
        </tr>
      </tbody>
    </v-table>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue';

interface Props {
  home: string;
  away: string;
  matchDetails: any;
}

defineProps<Props>();

const statLabels = ref([
  { label: 'Goals', key: 'Goals' },
  { label: 'Possession', key: 'Possession' },
  { label: 'Passes', key: 'Passes' },
  { label: 'Shots on Target', key: 'ShotsOnTarget' },
  { label: 'Fouls', key: 'Fouls' },
  { label: 'Yellow Cards', key: 'YellowCards' },
  { label: 'Red Cards', key: 'RedCards' },
]);

/** MatchSide Details
 *   Score: 0,
        Possession: 0,
        TimesWithBall: 0,
        Goals: 0,
        TotalShots: 0,
        ShotsOnTarget: 0,
        ShotsOffTarget: 0,
        Fouls: 0,
        YellowCards: 0,
        RedCards: 0,
        Passes: 0,
*/

/** Match Details
 * Title: string;
  LeagueName: string;
  Draw: boolean;
  Played: boolean;
  Time: Date;
  FirstHalfScore: string;
  FullTimeScore: string;
  HomeTeamScore: number;
  AwayTeamScore: number;
  Winner: string | null;
  Loser: string | null;
  MOTM: any;
  TotalPasses: number;
  Goals: number;
  HomeTeamDetails: IMatchSideDetails;
  AwayTeamDetails: IMatchSideDetails;
 */
</script>
