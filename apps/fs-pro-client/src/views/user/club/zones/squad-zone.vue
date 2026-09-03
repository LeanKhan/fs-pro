<template>
  <div>
    <v-row>
      <v-col cols="6">
        <v-card>
          <v-card-title>Player Latest Ratings</v-card-title>

          <table
            style="
              border: solid 2px white;
              border-collapse: collapse;
              width: 100%;
            "
          >
            <thead>
              <tr>
                <th style="border: solid 1px white; padding: 4px 4px">
                  Player (POS)
                </th>
                <th style="border: solid 1px white; padding: 4px 4px">Age</th>
                <th style="border: solid 1px white; padding: 4px 4px">Prev.</th>
                <th style="border: solid 1px white; padding: 4px 4px">Curr.</th>
              </tr>
            </thead>

            <tbody>
              <tr
                v-for="(player, i) in players"
                :key="player.id ?? player._id ?? i"
              >
                <td>
                  {{ player.FirstName ?? '' }}
                  {{ player.LastName ?? '' }}

                  <template v-if="player.Position">
                    ({{ player.Position }})
                  </template>
                </td>

                <td>
                  {{ player.Age ?? 'N/A' }}
                </td>

                <td>
                  <template v-if="player.latestRating">
                    {{ player.latestRating.old_rating ?? 'N/A' }}
                    |
                    {{ formatCurrency(player.latestRating.old_value) }}
                    VLA
                  </template>

                  <template v-else>N/A</template>
                </td>

                <td>
                  <template v-if="player.latestRating">
                    {{ formatCurrency(player.latestRating.rating) }}
                    |
                    {{ formatCurrency(player.latestRating.value) }}
                    VLA
                  </template>

                  <template v-else>N/A</template>
                </td>
              </tr>

              <tr v-if="players.length === 0">
                <td colspan="4" class="text-center pa-4">
                  No players available
                </td>
              </tr>
            </tbody>
          </table>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { currency } from '@/helpers/misc';

const props = defineProps<{
  club?: any | null;
}>();

const players = computed(() => {
  if (!Array.isArray(props.club?.Players)) {
    return [];
  }

  return props.club.Players.map((player: any) => {
    const history = Array.isArray(player?.RatingsHistory)
      ? player.RatingsHistory
      : [];

    return {
      ...player,
      latestRating: history.length > 0 ? history[history.length - 1] : null,
    };
  });
});

function formatCurrency(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    typeof value !== 'number' ||
    Number.isNaN(value)
  ) {
    return 'N/A';
  }

  return currency(value);
}
</script>

<style scoped>
table {
  text-align: left;
}

table tr:nth-child(even) {
  color: black;
  background-color: #f2f2f2;
}

table td {
  border: solid 1px white;
  padding: 4px;
}
</style>
