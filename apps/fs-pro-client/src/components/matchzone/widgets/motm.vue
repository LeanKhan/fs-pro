<template>
  <div class="d-flex justify-center">
    <v-btn
      v-if="!loadMOTM"
      :disabled="loading"
      :loading="loading"
      @click="getMOTM()"
    >
      Load
    </v-btn>

    <template v-else-if="loadMOTM && Player">
      <v-list dense flat tile>
        <!-- <v-list-item class="text-center center-text justify-center">
          <v-list-item-content>
            <v-avatar color="yellow">
              <v-icon color="white" large>
                mdi-star
              </v-icon>
            </v-avatar>
          </v-list-item-content>
        </v-list-item> -->

        <v-list-item>
          <v-list-item-avatar tile size="50px" color="transparent" class="h3">
            <span class="green--text font-weight-bold">
              10
            </span>
          </v-list-item-avatar>
          <v-list-item-content class="pa-0">
            <v-list-item-title>
              {{ Player.FirstName }}
              {{ Player.LastName }}
            </v-list-item-title>
          </v-list-item-content>
        </v-list-item>
      </v-list>
    </template>

    <v-sheet v-else>
      Could not load MOTM Data
    </v-sheet>
  </div>
</template>
<script lang="ts">
import { Player } from '@/interfaces/player';
import { Component, Vue, Prop } from 'vue-property-decorator';
@Component({})
export default class MOTM extends Vue {
  @Prop({ required: true, type: String }) motm_id!: string;

  private loading = false;
  private loadMOTM = false;
  private Player: any | Player = {};

  private getMOTM() {
    if (this.motm_id) {
      this.loading = true;
      this.$axios
        .get(`/players/${this.motm_id}/`)
        .then(response => {
          this.Player = response.data.payload;
          this.loadMOTM = true;
        })
        .catch(response => {
          console.log('Error fetching MOTM player!', response);
        })
        .finally(() => {
          this.loading = false;
        });
    }
  }
}
</script>
