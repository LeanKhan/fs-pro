<template>
  <transition name="drawer">
    <aside v-if="modelValue" class="drawer">
      <header class="drawer-head">
        <h2>{{ title }}</h2>
        <nav v-if="tabs && tabs.length > 1" class="drawer-tabs">
          <button v-for="(t, i) in tabs" :key="t" :class="{ on: i === tab }" @click="emit('update:tab', i)">{{ t }}</button>
        </nav>
        <button class="x" aria-label="Close" @click="emit('update:modelValue', false)" v-html="icon('close')"></button>
      </header>
      <!-- Dashboard screens render here in the campus palette (the 'cozy' Vuetify theme). -->
      <v-theme-provider theme="cozy" with-background class="drawer-body">
        <slot />
      </v-theme-provider>
    </aside>
  </transition>
</template>

<script setup lang="ts">
import { icon } from './icons';

defineProps<{ modelValue: boolean; title: string; tabs?: string[]; tab?: number }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'update:tab', i: number): void }>();
</script>
