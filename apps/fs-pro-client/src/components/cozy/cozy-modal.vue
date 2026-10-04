<template>
  <div v-if="modelValue" class="modal-root open">
    <div class="backdrop" @click="close"></div>
    <div class="modal" :class="size">
      <button class="x" aria-label="Close" @click="close" v-html="icon('close')"></button>
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { icon } from './icons';

defineProps<{ modelValue: boolean; size?: 'small' | 'wide' }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();
const close = () => emit('update:modelValue', false);
</script>
