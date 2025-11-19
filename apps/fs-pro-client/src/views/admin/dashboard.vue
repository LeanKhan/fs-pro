<template>
  <div class="home">
    <div class="d-flex justify-center align-center" style="height: 400px">
      <img
        alt="FsPro Logo :)"
        height="200px"
        :src="`${api}/img/logo-new.png`"
      />
    </div>
    <p class="display-2 secondary--text text-center">FSPro</p>
    <p class="caption secondary--text lighten-3 text-center">Let's go!</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useStore, apiUrl } from '@/store';

const store = useStore();
const api = apiUrl;
</script>
