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
      <v-card-text class="pa-0">
        <v-row>
          <v-col :class="{ yellow: player1Ready }">
            <v-card flat tile dense class="pa-0 justify-center text-center">
              <v-img
                v-if="home"
                contain
                class="mx-auto"
                :src="`${api}/img/clubs/kits/${home.ClubCode}-kit.png`"
              
                max-width="200px"
              ></v-img>
              <v-overlay :absolute="true" :value="true" opacity="0.3">
            
              <div class="headline">
                {{ home.Name }}
              </div>
              <v-card-text class="pa-0">
                <span v-if="!player1Ready">Are you ready?</span>

                 
                <template v-else>
                  Oya na!
                  <v-icon>
                    mdi-check
                  </v-icon>
                </template>
              </v-card-text>
              <v-card-actions class="justify-center">
                
                  <v-btn
                    color="accent"
                    :depressed="player1Ready"
                                        :class="{ 'darken-2': player1Ready }"
                    @click="player1Ready = !player1Ready"
                  >
                    READY
                  </v-btn>
              
              </v-card-actions>
              </v-overlay>
            </v-card>
          </v-col>
          <v-col :class="{ yellow: player2Ready }">
            <v-card flat tile dense class="pa-0 justify-center text-center">
              <v-img
                v-if="away"
                contain
                class="mx-auto"
                :src="`${api}/img/clubs/kits/${away.ClubCode}-kit.png`"
              
                max-width="200px"
              ></v-img>
              <v-overlay :absolute="true" :value="true" opacity="0.3">
            
             <div class="headline">
                {{ away.Name }}
              </div>
              <v-card-text class="pa-0">
<span v-if="!player2Ready">Are you ready?</span>

                 
                <template v-else>
                  Oya na!
                  <v-icon>
                    mdi-check
                  </v-icon>
                </template>              </v-card-text>
              <v-card-actions class="justify-center">
               
                  <v-btn
                    color="accent"
                    :depressed="player2Ready"
                    :class="{ 'darken-2': player2Ready }"
                    @click="player2Ready = !player2Ready"
                  >
                    READY
                  </v-btn>
                
              </v-card-actions>
              </v-overlay>
            </v-card>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import { apiUrl } from '@/store';

@Component({})
export default class GameLobby extends Vue {
  @Prop({ required: true, default: false, type: Boolean }) show!: boolean;
  @Prop({ required: true }) home!: any;
  @Prop({ required: true }) away!: any;

  private player1Ready = false;
  private player2Ready = false;
  private skip = false;
  private api = apiUrl;

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
