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
// import { Player } from '@/models/player';

@Component({})
export default class ViewPlayer extends Vue {
  private player: any = {};

  private mounted(): void {
    const cx = document.querySelector('canvas')?.getContext('2d');

    const baseHead = document.createElement('img');
    const baseJersey = document.createElement('img');
    const hair = document.createElement('img');
    const eyes = document.createElement('img');
    const nose = document.createElement('img');
    const mouth = document.createElement('img');

    const picturesPath = 'http://localhost:3000/img/players';

    baseHead.src = `${picturesPath}/player_sprites_base_head.png`;
    baseJersey.src = `${picturesPath}/player_sprites_base_upper_front_jersey.png`;

    hair.src = `${picturesPath}/player_sprites_hair_1.png`;

    eyes.src = `${picturesPath}/player_sprites_eyes_1.png`;

    nose.src = `${picturesPath}/player_sprites_nose_1.png`;

    mouth.src = `${picturesPath}/player_sprites_mouth_1.png`;

    baseHead.addEventListener('load', () => {
      cx!.drawImage(baseHead, 27, 27);
    });

    baseJersey.addEventListener('load', () => {
      cx!.drawImage(baseJersey, 0, 99);
    });

    hair.addEventListener('load', () => {
      cx!.drawImage(hair, 34.5, 27);
    });

    eyes.addEventListener('load', () => {
      cx!.drawImage(eyes, 51.5, 55.5);
    });

    nose.addEventListener('load', () => {
      cx!.drawImage(nose, 66.5, 50.5);
    });

    mouth.addEventListener('load', () => {
      cx!.drawImage(mouth, 47.5, 84.5);
    });
  }
}
</script>

<style></style>
