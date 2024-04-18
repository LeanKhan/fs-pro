<template>
  <div>
    <v-card>
      <v-toolbar flat color="indigo darken-1">
        <v-btn icon @click="goBack">
          <v-icon>
            mdi-arrow-left
          </v-icon>
        </v-btn>

        <v-toolbar-title class="ml-1">
          View Manager
        </v-toolbar-title>
      </v-toolbar>
    </v-card>

    <v-container>
      <v-card>
        <v-card-text>
          {{ manager.FirstName }} {{ manager.LastName }}
        </v-card-text>
      </v-card>
    </v-container>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component
export default class ViewManager extends Vue {
  private goBack() {
    this.$router.back();
  }

  private manager = {};

  private mounted(): void {
    const managerId = this.$route.params['id'];
    // const clubCode = this.$route.params['code'];
    this.$axios
      .get(`/managers/${managerId}`)
      .then(response => {
        this.manager = response.data.payload;
      })
      .catch(response => {
        console.log('Response => ', response);
      });
  }
}
</script>

<style></style>
