<template>
  <v-dialog
    :value="show"
    @input="$emit('update:show', $event)"
    height="500px"
    width="650px"
    overlay-opacity="0.6"
  >
    <v-card height="100%" tile :loading="!allReady">
      <v-toolbar color="green accent-3" dense flat tile>
        <v-toolbar-title class="mx-auto">Get ready to play!</v-toolbar-title>
      </v-toolbar>
      <v-card-text>
        <v-row>
          <v-col>
            <v-card flat tile>
              <v-card-title>
                Player 1
              </v-card-title>
              <v-card-text>
                Are you ready?
              </v-card-text>
              <v-card-actions>
                <template>
                  <v-btn
                    color="primary darken-3"
                    depressed
                    @click="player1Ready = !player1Ready"
                  >
                    READY
                  </v-btn>
                </template>
                <template v-if="player1Ready">
                  Oya na!
                  <v-icon>
                    mdi-smile
                  </v-icon>
                </template>
              </v-card-actions>
            </v-card>
          </v-col>
          <v-col>
            <v-card flat tile>
              <v-card-title>
                Player 2
              </v-card-title>
              <v-card-text>
                Are you ready?
              </v-card-text>
              <v-card-actions>
                <template>
                  <v-btn
                    color="pink darken-3"
                    depressed
                    @click="player2Ready = !player2Ready"
                  >
                    READY
                  </v-btn>
                </template>
                <template v-if="player2Ready">
                  Oya na!
                  <v-icon>
                    mdi-smile
                  </v-icon>
                </template>
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';

@Component({})
export default class GameLobby extends Vue {
  @Prop({ required: true, default: false, type: Boolean }) show!: boolean;

  private player1Ready = false;
  private player2Ready = false;
  private skip = false;

  get allReady() {
    return this.player1Ready && this.player2Ready;
  }

  @Watch('allReady', { immediate: true })
  onAllReady(ready: boolean) {
    if (ready) {
      console.log('All are ready!');
      this.$emit('all-ready');
    }
  }
}
</script>
