<template>
  <div id="end-of-year">
    <v-card v-if="calendar">
      <v-card-text class="justify-center text-center">
        <v-card-title>End Year {{ calendar.YearString }} !</v-card-title>
        <p v-if="!calendar.isEnded && !ended">
          <v-btn
            color="accent"
            :loading="loading"
            :disabled="loading"
            @click="endYear()"
          >
            End Year Now
          </v-btn>
        </p>

        <p v-else>
          {{ calendar.YearString }} ended successfully! Admin will start a new
          year soon :) Thank you Jesus!

          <v-btn block color="success" @click="$router.push('/u')">
            Continue
          </v-btn>
        </p>
      </v-card-text>
    </v-card>

    <!-- loading overlay -->
    <v-overlay :value="loading">
      <v-progress-circular indeterminate size="68"></v-progress-circular>
    </v-overlay>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component
export default class EndOfYear extends Vue {
  // after end of season, check if the Year is alos over (that is, all the seasons are finished...)
  // then go to End Of Year...

  private loading = false;

  private ended = false;

  private calendar: any = {};

  get calendarId() {
    return this.$route.params.calendar_id;
  }

  private endYear() {
    const ans = confirm('Are you sure you want to end this Year?');

    if (!ans) return false;

    this.loading = true;
    this.$axios
      .post(`/calendar/${this.calendarId}/end`)
      .then(response => {
        if (response.data.success) {
          console.log(response.data);

          this.calendar = response.data.payload;
          this.ended = true;

          // Well, set new current Calendar! This should return null...
          this.$store.dispatch('SET_CALENDAR');
        }
      })
      .catch(response => {
        console.log('Error ending Calendar => ');
        this.calendar = response;
      })
      .finally(() => {
        this.loading = false;
      });
  }

  mounted() {
    this.loading = true;
    this.$axios
      .get(`/calendar/current`)
      .then(response => {
        this.calendar = response.data.payload;
      })
      .catch(err => {
        console.log('Error fetching current Calendar => ', err);
      })
      .finally(() => {
        this.loading = false;
      });
  }
}
</script>

<style></style>
