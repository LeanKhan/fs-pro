<template>
  <v-dialog v-model="show" max-width="500">
    <v-card class="away-summary-card pa-5 rounded-2xl text-center">
      <div class="header-icon-box mx-auto mb-3 d-flex align-center justify-center rounded-2xl">
        <span class="header-icon">🗞️</span>
      </div>

      <div class="text-overline text-amber font-weight-bold letter-spacing-2 mb-1">
        EXECUTIVE BRIEFING
      </div>
      <div class="text-h6 font-weight-bold text-white mb-1">
        While You Were Away
      </div>
      <div class="text-caption text-medium-emphasis mb-4">
        Your club directors and coaching staff have kept the campus active:
      </div>

      <!-- Events List -->
      <div class="events-list d-flex flex-column gap-2 mb-4 text-left">
        <div
          v-for="(event, idx) in events"
          :key="idx"
          class="event-card pa-3 rounded-xl d-flex align-center gap-3"
        >
          <div class="event-icon-box d-flex align-center justify-center rounded-lg">
            <span>{{ event.icon }}</span>
          </div>
          <div class="flex-1">
            <div class="text-body-2 font-weight-bold text-white">{{ event.title }}</div>
            <div class="text-caption text-medium-emphasis">{{ event.description }}</div>
          </div>
          <div v-if="event.badge" class="text-right">
            <v-chip size="x-small" :color="event.badgeColor || 'primary'" variant="flat" class="font-weight-bold">
              {{ event.badge }}
            </v-chip>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <v-btn
        color="amber-darken-2"
        size="large"
        block
        class="font-weight-black text-uppercase"
        variant="flat"
        @click="show = false"
      >
        Understood, Let's Play!
      </v-btn>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export interface AwayEventItem {
  icon: string;
  title: string;
  description: string;
  badge?: string;
  badgeColor?: string;
}

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    events?: AwayEventItem[];
  }>(),
  {
    modelValue: false,
    events: () => [],
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
}>();

const show = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val),
});
</script>

<style scoped>
.away-summary-card {
  background: rgba(15, 23, 42, 0.98) !important;
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 16px 56px rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(16px);
}

.header-icon-box {
  width: 64px;
  height: 64px;
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.35);
}

.header-icon {
  font-size: 2rem;
}

.letter-spacing-2 {
  letter-spacing: 2px;
}

.event-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.event-icon-box {
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.06);
  font-size: 1.25rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
}
</style>
