<template>
  <v-avatar :size="size" :color="failed ? 'indigo-darken-2' : 'transparent'" class="club-crest" rounded="0">
    <img v-if="!failed && src" :src="src" :alt="name || code || ''" :width="size" :height="size" style="object-fit: contain" @error="failed = true" />
    <span v-else class="text-caption font-weight-bold">{{ initials }}</span>
  </v-avatar>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { crestUrl } from '@/helpers/crest';

const props = withDefaults(defineProps<{ code?: string | null; name?: string | null; size?: number }>(), {
  code: '',
  name: '',
  size: 28,
});

const failed = ref(false);
const src = computed(() => crestUrl(props.code));
watch(src, () => (failed.value = false));
const initials = computed(() =>
  (props.code || props.name || '?')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .slice(0, 3)
    .toUpperCase()
);
</script>
