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

            <v-btn append-icon="mdi-plus" color="success" to="/a/managers/new">
              New
            </v-btn>
          </v-toolbar>
        </v-card>
      </v-col>

      <v-col cols="12">
        <managers-table :managers="managers"></managers-table>
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import ManagersTable from '@/components/managers/managers-table.vue';
// import { Player } from '@/interfaces/player';

@Component({
  components: {
    ManagersTable,
  },
})
export default class ManagersDashboard extends Vue {
  private managers: any[] = [];

  public mounted() {
    this.$axios
      .get('/managers?populate=Club')
      .then(res => {
        this.managers = res.data.payload;
      })
      .catch(err => {
        console.log('Error! => ', err);
      });
  }
}
</script>

<style></style>
