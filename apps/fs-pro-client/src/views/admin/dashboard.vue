<template>
  <div class="home">
    <div class="d-flex justify-center align-center" style="height: 400px">
      <img
        alt="FsPro Logo :)"
        height="200px"
        :src="`/logo-new.png`"
      />
    </div>
    <p class="text-h2 text-secondary text-center">FSPro</p>
    <p class="text-caption text-secondary text-center">Let's go!</p>
  </div>
</template>

<script setup lang="ts">
import { apiUrl } from '@/store';

const api = apiUrl;
</script>
