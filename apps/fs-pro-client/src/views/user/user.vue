<template>
  <router-view></router-view>
</template>

<script setup lang="ts">
import { onMounted, nextTick } from 'vue';
import { useStore } from '@/store';
import { ICalendar } from '@/interfaces/calendar';
import { $axios } from '@/main';

const store = useStore();

async function getCurrentCalendar() {
  try {
    const response = await $axios.get('/current');
    console.log('Current calendar:', response.data);
  } catch (error) {
    console.error(error);
  }
}

onMounted(async () => {
  // Set calendar in store
  store.setCalendar();

  await nextTick();
  console.log('Inside nextTick at', new Date());

  // Set user clubs and update store
  store.setUserClubs();
});
</script>
