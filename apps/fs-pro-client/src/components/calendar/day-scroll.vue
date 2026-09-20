<template>
  <v-slide-group
    show-arrows
    mandatory
    v-model="selectedDayIndex"
    center-active
    class="day-slide-group"
  >
    <v-slide-group-item
      v-for="(day, i) in days"
      :key="day.Day ?? i"
      :value="i"
      v-slot:default="{ isSelected, toggle }"
    >
      <calendar-day
        :day="day"
        :active="isSelected"
        :toggle="toggle"
        :club="club"
        :singleLeague="singleLeague"
      ></calendar-day>
    </v-slide-group-item>
  </v-slide-group>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useStore } from '@/store';
import CalendarDay from './day.vue';

interface Props {
  days: any[];
  singleLeague: boolean;
  club?: string;
  modelValue?: number;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: 0,
});
const emit = defineEmits<{
  'update:modelValue': [value: number];
  'selected-day-index-changed': [value: number];
}>();

const store = useStore();
const selectedDayIndex = ref(props.modelValue ?? 0);

const days = computed(() => props.days);
const singleLeague = computed(() => props.singleLeague);
const currentDay = computed(() => store.calendar?.CurrentDay);

function syncToCurrentDay() {
  if (!days.value || days.value.length === 0) return;
  const cur = currentDay.value ?? 0;
  const todayIdx = days.value.findIndex((d: any) => d.Day === cur);
  if (todayIdx !== -1) {
    selectedDayIndex.value = todayIdx;
  } else {
    const nextIdx = days.value.findIndex((d: any) => d.Day >= cur);
    selectedDayIndex.value = nextIdx !== -1 ? nextIdx : 0;
  }
}

watch(
  () => props.modelValue,
  (val) => {
    if (val !== undefined && val !== selectedDayIndex.value) {
      selectedDayIndex.value = val;
    }
  }
);

watch(
  () => props.days,
  (newDays) => {
    if (newDays && newDays.length > 0) {
      if (props.modelValue === undefined || props.modelValue === 0) {
        syncToCurrentDay();
      } else {
        selectedDayIndex.value = props.modelValue;
      }
    }
  },
  { immediate: true }
);

watch(
  currentDay,
  () => {
    syncToCurrentDay();
  }
);

watch(selectedDayIndex, (val) => {
  emit('update:modelValue', val);
  emit('selected-day-index-changed', val);
});
</script>

<style scoped>
.day-slide-group :deep(.v-slide-group__content) {
  padding: 8px 4px;
}
</style>
