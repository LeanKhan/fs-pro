<template>
  <canvas width="144" height="154"></canvas>
</template>

<script lang="ts">
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Appearance } from '@/interfaces/player';
import { apiUrl } from '@/store';

@Component({})
export default class PlayerAvatar extends Vue {
  @Prop({ required: true }) appearance!: Appearance;

  public api: string = apiUrl;

  // TODO: save the position of the facial features in db [?]

  private mounted() {
    const cx = document.querySelector('canvas')?.getContext('2d');

    const baseHead = document.createElement('img');
    const baseJersey = document.createElement('img');
    const hair = document.createElement('img');
    const eyes = document.createElement('img');
    const nose = document.createElement('img');
    const mouth = document.createElement('img');
    const eyebrows = document.createElement('img');

    const picturesPath = `${this.api}/img/players/appearance`;

    baseHead.src = `${picturesPath}/head-${this.appearance.head.variant}-${this.appearance.head.style}.png`;
    baseJersey.src = `${picturesPath}/kit-default-front.png`;

    hair.src = `${picturesPath}/hair-${this.appearance.hair.variant}-${this.appearance.hair.style}.png`;

    eyes.src = `${picturesPath}/eyes-${this.appearance.eyes.variant}-${this.appearance.eyes.style}.png`;

    nose.src = `${picturesPath}/nose-${this.appearance.nose.variant}-${this.appearance.nose.style}.png`;

    mouth.src = `${picturesPath}/mouth-${this.appearance.mouth.variant}-${this.appearance.mouth.style}.png`;

    eyebrows.src = `${picturesPath}/eyebrows-${this.appearance.eyebrows.variant}-${this.appearance.eyebrows.style}.png`;

    baseHead.addEventListener('load', () => {
      cx!.drawImage(baseHead, 31, 28);
      hair.addEventListener('load', () => {
        cx!.drawImage(hair, 36, 19);
      });
      eyes.addEventListener('load', () => {
        cx!.drawImage(eyes, 47, 50);
      });

      nose.addEventListener('load', () => {
        cx!.drawImage(nose, 57, 54);
      });

      mouth.addEventListener('load', () => {
        cx!.drawImage(mouth, 47, 85);
      });

      eyebrows.addEventListener('load', () => {
        cx!.drawImage(eyebrows, 45, 40);
      });
      baseJersey.addEventListener('load', () => {
        cx!.drawImage(baseJersey, 0, 99);
      });
    });
  }
}
</script>

<style></style>
