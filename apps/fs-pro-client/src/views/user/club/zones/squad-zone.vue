<template>
  <div>
    <!-- Show Players' RatingsHistory. Thank you Jesus! -->

    <v-row>
      <v-col cols="6">
        <v-card>
          <v-card-title>Player Latest Ratings</v-card-title>
          <table style="border: solid 2px white;border-collapse: collapse;width: 100%;">
            <thead>
              <th style="border: solid 1px white;padding: 4px 4px;">Player (POS)</th>
              <th style="border: solid 1px white;padding: 4px 4px;">Age</th>
              <th style="border: solid 1px white;padding: 4px 4px;">Prev.</th>
              <th style="border: solid 1px white;padding: 4px 4px;">Curr.</th>
            </thead>
            <tbody>
              <tr v-for="(player, i) in club.Players" :key="i">
                <td>
                  {{ player.FirstName }} {{ player.LastName }} ({{player.Position}})
                </td>
                 <td>
                  {{ player.Age }}
                </td>
                <td>
                  {{ player.RatingsHistory[player.RatingsHistory.length - 1].old_rating }}
                  | {{ player.RatingsHistory[player.RatingsHistory.length - 1].old_value | currency }} VLA
                </td>
                <td>
                  {{ player.RatingsHistory[player.RatingsHistory.length - 1].rating }}
                  | {{ player.RatingsHistory[player.RatingsHistory.length - 1].value | currency }}VLA
                </td>
               
              </tr>
            </tbody>
          </table>
        </v-card>
      </v-col>
    </v-row>

  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class SquadZone extends Vue {
    @Prop({ required: true }) club!: any;

}
</script>

<style scoped>
table {
  text-align: left;
}
  table tr:nth-child(even) {
    color: var(--dark);
    color: black;
    background-color: #f2f2f2;
  }

  table td {
    border: solid 1px white;
    padding: 4px;
  }
</style>
