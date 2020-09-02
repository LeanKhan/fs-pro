<template>
  <v-dialog
    :value="show"
    @input="$emit('update:show', $event)"
    height="500px"
    width="650px"
    overlay-opactiy="0.6"
  >
    <v-card height="100%" tile>
      <v-toolbar color="green accent-3" dense flat tile>
        <v-toolbar-title class="mx-auto">Get ready to play!</v-toolbar-title>
      </v-toolbar>
      <v-card-text>
        <v-row>
          <v-col>
            <v-card flat tile>
              <v-card-title>
                You
              </v-card-title>
              <v-card-text>
                You game?
              </v-card-text>
              <v-card-actions>
                <template v-if="!imReady">
                  <v-btn color="primary" depressed @click="$emit('ready')">
                    I'm ready!
                  </v-btn>
                </template>
                <template v-else>
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
                The other player
              </v-card-title>
              <v-card-text>
                Their team...
              </v-card-text>
              <v-card-actions>
                <v-progress-linear
                  indeterminate
                  color="yellow darken-2"
                ></v-progress-linear>
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component({})
export default class GameLobby extends Vue {
  @Prop({ required: true, default: false, type: Boolean }) show!: boolean;
  @Prop({ required: true, default: false, type: Boolean }) imReady!: boolean;
}
</script>
