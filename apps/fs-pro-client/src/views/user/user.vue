<template>
  <router-view></router-view>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { ICalendar } from '@/interfaces/calendar';

@Component({})
export default class User extends Vue {
  // get current calendar...
  private currentCalendar: ICalendar | unknown = {};

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
      // this.$store.dispatch('SET_SEASONS');
      this.$store.dispatch('SET_USER_CLUBS');
    });
  }
}
</script>
