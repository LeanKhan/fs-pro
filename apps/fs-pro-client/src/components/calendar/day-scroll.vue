<template>
  <v-slide-group show-arrows mandatory v-model="selectedDayIndex"
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

<script lang="ts">
import { defineComponent, ref, computed, watch } from 'vue';
import { useStore } from '@/store';
import CalendarDay from './day.vue';

const store = useStore();

export default defineComponent({
  name: 'DayScroll',
  components: {
    CalendarDay,
  },
  props: {
    days: {
      type: Array,
      required: true,
    },
    singleLeague: {
      type: Boolean,
      required: true,
    },
    club: {
      type: String,
      required: false,
    },
  },
  setup(props, { emit }) {
    const selectedDayIndex = ref(0);

    const days = computed(() => props.days);
    const singleLeague = computed(() => props.singleLeague);

    const currentDay = computed(() => {
      // Assuming `this.$store.getters.calendar.CurrentDay` is replaced with a Vuex 4 getter
      return store.calendar?.CurrentDay || {};
    });

    watch(selectedDayIndex, (val) => {
      console.log('Changed ', val);
      emit('selected-day-index-changed', val);
    });

    const nextDay = () => {
      console.log('Next clicked');
    };

    return {
      selectedDayIndex,
      days,
      singleLeague,
      currentDay,
      nextDay,
    };
  },
});
</script>

<style></style>
