<template>
  <v-slide-group
    show-arrows
    mandatory
    v-model="selectedDayIndex"
    center-active
    @click:next="nextDay"
  >
    <v-slide-item
      v-for="(day, i) in days"
      :key="i"
      v-slot:default="{ active, toggle }"
    >
      <calendar-day
        :day="day"
        :active="active"
        :toggle="toggle"
        :club="club"
        :singleLeague="singleLeague"
      ></calendar-day>
    </v-slide-item>
  </v-slide-group>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
// import { useStore } from '@/store';
import CalendarDay from './day.vue';

interface Props {
  days: any[];
  singleLeague: boolean;
  club?: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'selected-day-index-changed': [value: number];
}>();

// const store = useStore();
const selectedDayIndex = ref(0);

const days = computed(() => props.days);
const singleLeague = computed(() => props.singleLeague);

// const currentDay = computed(() => {
//   return store.calendar?.CurrentDay || {};
// });

watch(selectedDayIndex, (val) => {
  console.log('Changed ', val);
  emit('selected-day-index-changed', val);
});

const nextDay = () => {
  console.log('Next clicked');
};
</script>
