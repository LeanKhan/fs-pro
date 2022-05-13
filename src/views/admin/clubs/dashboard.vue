<template>
  <div>
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-toolbar flat color="amber darken-1">
            <v-toolbar-title class="ml-1">
              Dashboard
            </v-toolbar-title>

            <v-spacer></v-spacer>

            <v-btn append-icon="mdi-plus" color="success" to="./clubs/new">
              New
            </v-btn>
          </v-toolbar>
        </v-card>
      </v-col>

      <v-col cols="12">
        <all-clubs-table :clubs="clubs"></all-clubs-table>
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Club } from '@/interfaces/club';
import AllClubsTable from '@/components/clubs/allclubs-table.vue';

@Component({
  components: {
    AllClubsTable,
  },
})
export default class ClubsDashboard extends Vue {
  private clubs: any[] = [];

  private mounted() {
    this.$axios
      .get('/clubs/all')
      .then(res => {
        this.clubs = res.data.payload as Club[];
      })
      .catch(err => {
        console.log('Error! => ', err);
      });
  }
}
</script>

<style></style>
