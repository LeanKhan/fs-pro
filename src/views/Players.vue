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
            All Players
          </v-tab>
          <v-tab>
            New Player
          </v-tab>
        </v-tabs>

        <v-tabs-items v-model="tab">
          <v-tab-item>
            <v-card flat>
              <all-players></all-players>
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
import AllPlayers from '../components/players/all-players.vue';

@Component({
  components: {
    AllPlayers,
  },
})
export default class Players extends Vue {
  private tab: unknown = null;
}
</script>

<style></style>
