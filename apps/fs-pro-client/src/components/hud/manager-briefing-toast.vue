<template>
  <v-card class="manager-briefing-toast pa-3 d-flex align-center gap-3 border" rounded="lg" :style="glassStyle">
    <v-avatar size="44" color="indigo-darken-4" class="elevation-2 flex-shrink-0">
      <v-img v-if="avatarUrl" :src="avatarUrl" alt="Manager"></v-img>
      <v-icon v-else size="26" color="amber-lighten-2">mdi-account-tie</v-icon>
    </v-avatar>

    <div class="d-flex flex-column">
      <div class="text-caption font-weight-bold text-white">{{ title }}</div>
      <div class="text-caption text-medium-emphasis">{{ message }}</div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    avatarUrl?: string;
    title?: string;
    message?: string;
  }>(),
  {
    title: 'Welcome to Segun FC!',
    message: 'Your journey starts here. Build your club, train your team and take on your first opponents.',
  }
);

const glassStyle = {
  background: 'linear-gradient(135deg, rgba(30, 34, 53, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)',
  borderColor: 'rgba(99, 102, 241, 0.3)',
  maxWidth: '360px',
};
</script>

<style scoped>
.manager-briefing-toast {
  pointer-events: auto;
}
@media (max-width: 600px) {
  .manager-briefing-toast {
    display: none !important;
  }
}
</style>
