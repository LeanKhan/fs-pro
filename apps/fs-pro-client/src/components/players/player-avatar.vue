<template>
  <canvas width="144" height="154"></canvas>
</template>

<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { ref, onMounted } from 'vue';
import { Appearance } from '@/interfaces/player';
import { apiUrl } from '@/store';

interface Props {
  appearance: Appearance;
}

const props = defineProps<Props>();

const api = ref<string>(apiUrl);

// TODO: save the position of the facial features in db [?]

onMounted(() => {
  const cx = document.querySelector('canvas')?.getContext('2d');

  const baseHead = document.createElement('img');
  const baseJersey = document.createElement('img');
  const hair = document.createElement('img');
  const eyes = document.createElement('img');
  const nose = document.createElement('img');
  const mouth = document.createElement('img');
  const eyebrows = document.createElement('img');

  const picturesPath = `${api.value}/img/players/appearance`;

  baseHead.src = `${picturesPath}/head-${props.appearance.head.variant}-${props.appearance.head.style}.png`;
  baseJersey.src = `${picturesPath}/kit-default-front.png`;

  hair.src = `${picturesPath}/hair-${props.appearance.hair.variant}-${props.appearance.hair.style}.png`;

  eyes.src = `${picturesPath}/eyes-${props.appearance.eyes.variant}-${props.appearance.eyes.style}.png`;

  nose.src = `${picturesPath}/nose-${props.appearance.nose.variant}-${props.appearance.nose.style}.png`;

  mouth.src = `${picturesPath}/mouth-${props.appearance.mouth.variant}-${props.appearance.mouth.style}.png`;

  eyebrows.src = `${picturesPath}/eyebrows-${props.appearance.eyebrows.variant}-${props.appearance.eyebrows.style}.png`;

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
});
</script>

<style></style>
