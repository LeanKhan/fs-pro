<template>
  <v-dialog
    :model-value="modelValue"
    content-class="side-sheet"
    transition="slide-x-reverse-transition"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card class="side-sheet-card" :style="{ width: `min(${width}px, 100vw)` }">
      <slot />
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
/** A right-hand panel for full-screen game views, which have no Vuetify
 * layout for a navigation drawer (docs/WORLD-VIEW-UI-PLAN.md, "Panels"). */
withDefaults(defineProps<{ modelValue: boolean; width?: number }>(), { width: 420 });
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();
</script>

<style>
.v-dialog > .v-overlay__content.side-sheet {
  margin: 0 0 0 auto !important;
  height: 100% !important;
  max-height: 100% !important;
  width: auto !important;
  max-width: 100vw !important;
}
.side-sheet-card {
  height: 100%;
  border-radius: 0 !important;
  overflow-y: auto;
}
</style>
