<template>
  <div>
    <router-view></router-view>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { CalendarInterface } from '../../types/calendar';

@Component({})
export default class User extends Vue {
  // get current calendar...
  private currentCalendar: CalendarInterface | unknown = {};

  private getCurrentCalendar() {
    this.$axios
      .get('/current')
      .then(response => {
        console.log('Current calendar: ', response.data);
      })
      .catch(response => {
        console.log(response);
      });
  }

  private mounted() {
    this.$store.dispatch('SET_CALENDAR');

    this.$nextTick(() => {
      console.log('Inside nextTick at ', new Date());
      this.$store.dispatch('SET_USER_CLUBS');
    });
  }
}
</script>
