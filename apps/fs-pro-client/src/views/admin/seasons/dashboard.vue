<template>
  <div>
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-card-title>
            Seasons
            <v-spacer></v-spacer>
            <v-btn append-icon="mdi-plus" color="success">
              Add
            </v-btn>
          </v-card-title>
        </v-card>
      </v-col>

      <v-col cols="12">
        <seasons-table
          :seasons="seasons"
          :competition-id="competitionId"
        ></seasons-table>
      </v-col>
    </v-row>
  </div>
</template>
<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import SeasonsTable from '@/components/seasons/seasons-table.vue';
import { Season } from '@/interfaces/season';

@Component({
  components: {
    SeasonsTable,
  },
})
export default class CompetitionSeasonsHome extends Vue {
  //   TODO: Add a filter by competition type...
  // it can be a select menu :)...

  private seasons: Season[] = [];

  private competitionId = 'undefined';

  private search = '';

  public mounted() {
    const compId = this.$route.params['id'];

    this.$axios
      .get(`/competitions/${compId}/seasons/all`)
      .then(res => {
        this.seasons = res.data.payload as Season[];
      })
      .catch(err => {
        console.log('Error! => ', err);
      });
  }
}
</script>
<style scoped>
table tr {
  cursor: pointer !important;
}
table tr:active {
  background-color: #3f51b5 !important;
  border-color: #3f51b5 !important;
}
</style>
