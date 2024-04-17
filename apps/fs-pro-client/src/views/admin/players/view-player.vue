<template>
  <div>
    <v-row>
      <v-col cols="8">
        <canvas width="144" height="154"></canvas>
      </v-col>
    </v-row>
    <v-row>
      <v-col cols="6">
        <v-card>
          <v-card-title>
            Calendar
          </v-card-title>
          <v-sheet color="purple purple-lighten-1" height="180">
            Nothing here...
          </v-sheet>
        </v-card>
      </v-col>
      <v-col cols="6">
        <v-card>
          <v-card-title>
            Standings (Table)
          </v-card-title>
          <v-sheet color="blue blue-lighten-1" height="180">
            Nothing here...
          </v-sheet>
        </v-card>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12">
        <v-card>
          <v-card-title>
            Fixtures
          </v-card-title>
          <v-sheet
            class="text-center"
            color="secondary secondary-lighten"
            height="250"
          >
            <span>
              Season is not activated
            </span>
          </v-sheet>
        </v-card>
      </v-col>
      <v-col cols="12">
        <v-card>
          <v-card-title>
            Player Stats (Records)
          </v-card-title>
          <v-sheet color="secondary secondary-lighten" height="250"></v-sheet>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
// import { Player } from '@/interfaces/player';

@Component({})
export default class ViewPlayer extends Vue {
  private player: any = {};
}
</script>

<style></style>
