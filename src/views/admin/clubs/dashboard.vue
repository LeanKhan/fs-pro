<template>
  <div>
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-card-title>
            Clubs
            <v-spacer></v-spacer>
            <v-btn append-icon="mdi-plus" color="success">
              New
            </v-btn>
          </v-card-title>
        </v-card>
      </v-col>

      <v-col cols="12">
        <clubs-table :clubs="clubs"></clubs-table>
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Club } from '../../../models/club';
import ClubsTable from '../../../components/clubs/allclubs-table.vue';

@Component({
  components: {
    ClubsTable,
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
