<template>
  <v-slide-group show-arrows mandatory v-model="selectedDayIndex" center-active>
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
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import CalendarDay from './day.vue';
@Component({
  components: {
    CalendarDay,
  },
})
export default class DayScroll extends Vue {
  @Prop({ required: true }) readonly days!: [{}];
  @Prop({ required: true }) readonly singleLeague!: boolean;
  @Prop() readonly club?: string;

  private selectedDayIndex = 0;

  @Watch('selectedDayIndex', { immediate: true })
  onSelectedDayIndexChanged(val: number) {
    this.$emit('selected-day-index-changed', val);
  }
}
</script>

<style></style>
