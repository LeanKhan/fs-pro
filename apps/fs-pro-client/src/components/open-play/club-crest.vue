<template>
  <v-avatar :size="size" :color="known ? 'transparent' : 'indigo-darken-2'" class="club-crest">
    <v-icon v-if="known" :size="size">custom:{{ code }}</v-icon>
    <span v-else class="text-caption font-weight-bold">{{ initials }}</span>
  </v-avatar>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { iconFileByName } from '@/plugins/customIcons';

const props = withDefaults(defineProps<{ code?: string | null; name?: string | null; size?: number }>(), {
  code: '',
  name: '',
  size: 28,
});

const known = computed(() => !!props.code && props.code in iconFileByName);
const initials = computed(() =>
  (props.code || props.name || '?')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .slice(0, 3)
    .toUpperCase()
);
</script>
