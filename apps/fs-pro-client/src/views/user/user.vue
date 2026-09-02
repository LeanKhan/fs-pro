<template>
  <router-view></router-view>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useStore } from '@/store';

defineOptions({
  name: 'UserView',
});

const store = useStore();

onMounted(async () => {
  await store.setCalendar();
  await store.setUserClubs();
});
</script>
