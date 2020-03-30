<template>
  <div>
    <v-row>
      <v-col>
        <v-tabs
          v-model="tab"
          background-color="transparent"
          color="purple"
          grow
        >
          <v-tab>
            All Clubs
          </v-tab>
          <v-tab>
            New Club?
          </v-tab>
        </v-tabs>

        <v-tabs-items v-model="tab">
          <v-tab-item>
            <v-card flat>
              <all-clubs></all-clubs>
            </v-card>
          </v-tab-item>

          <v-tab-item>
            <v-card flat>
              <v-card-text>
                Content here...
              </v-card-text>
            </v-card>
          </v-tab-item>
        </v-tabs-items>
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import AllClubs from '../components/clubs/all-clubs.vue';

@Component({
  components: {
    AllClubs,
  },
})
export default class Clubs extends Vue {
  private tab: unknown = null;
}
</script>

<style></style>
