<template>
  <div>
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-toolbar flat color="indigo darken-1">
            <v-toolbar-title class="ml-1">
              Dashboard
            </v-toolbar-title>

            <v-spacer></v-spacer>

            <v-btn append-icon="mdi-plus" color="success" to="players/new">
              New
            </v-btn>
          </v-toolbar>
        </v-card>
      </v-col>

      <v-col cols="12">
        <players-table :players="players" :viewClub="false"></players-table>
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import PlayersTable from '@/components/players/players-table.vue';
import { Player } from '@/interfaces/player';

@Component({
  components: {
    PlayersTable,
  },
})
export default class PlayersDashboard extends Vue {
  private players: any[] = [];

  public mounted() {
    console.log('Mounted players!');
    this.$axios
      .get('/players/all')
      .then(res => {
        this.players = res.data.payload as Player[];
        console.log(res.data);
      })
      .catch(err => {
        console.log('Error! => ', err);
      });
  }
}
</script>

<style></style>
