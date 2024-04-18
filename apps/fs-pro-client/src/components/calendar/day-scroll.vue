<template>
  <v-slide-group show-arrows mandatory v-model="selectedDayIndex"
   center-active
   @click:next="nextDay()"
   >
    <v-slide-item
      v-for="(day, i) in days$"
      :key="i"
      v-slot:default="{ active, toggle }"
    >
      <calendar-day
        :day="day"
        :active="active"
        :toggle="toggle"
        :club="club"
        :singleLeague="singleLeague$"
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

  public selectedDayIndex = 0;

  // public days$ = this.days;
  // public singleLeague$ = this.singleLeague;

  get days$() {
    return this.days;
  }

   get singleLeague$() {
    return this.singleLeague;
  }

  get currentDay() {
    return this.$store.getters.calendar.CurrentDay;
  }
  // private selectedDayIndex = this.currentDay ? (this.currentDay - 1) % 7 : 0;

  @Watch('selectedDayIndex', { immediate: false })
  onSelectedDayIndexChanged(val: number) {
    console.log('Changed ', val)
    this.$emit('selected-day-index-changed', val);
  }

  public nextDay() {
    console.log('Next clicked');
  }
}
</script>

<style></style>
