<template>
  <div>
    <v-card :loading="loading">
      <!-- // Toolbar -->
      <v-toolbar>
        <!-- Current day -->
        <v-toolbar-title class="subtitle-1 font-weight-bold indigo--text">
          Current Calendar: {{ calendar.YearString }}
        </v-toolbar-title>

        <v-toolbar-items>
          <v-btn
            color="warning"
            v-if="calendar.allSeasonsCompleted"
            @click="endYear()"
          >
            END YEAR
          </v-btn>
        </v-toolbar-items>
      </v-toolbar>

      <v-card-title>New Calendar...</v-card-title>
      <v-card-text>
        <v-row>
          <v-col cols="6">
            <v-btn
              color="primary"
              :disabled="loading"
              :loading="loading"
              @click="createNewYear()"
            >
              New Calendar Year
            </v-btn>
            <br />
            <v-checkbox
              v-model="randomMonth"
              label="Random Month"
              hint="Random Month like 'CGB'"
            ></v-checkbox>
          </v-col>
          <v-col cols="6">
            <v-input readonly value="2020"></v-input>
          </v-col>
        </v-row>
      </v-card-text>

      <v-snackbar color="success" v-model="success">
        success!
      </v-snackbar>
    </v-card>

    <v-card>
      <v-card-title>
        Calendars
      </v-card-title>

      <v-card-text>
        <ul>
          <li v-for="cndr in calendars" :key="cndr._id">
            {{ cndr.YearString }}

            <v-chip small>
              {{ cndr.isActive ? 'Active' : 'Not Active' }}
            </v-chip>

            <v-chip small v-if="cndr.isEnded">
              Ended
            </v-chip>

            <v-btn
              v-if="cndr.Days && cndr.Days.length > 0"
              text
              small
              @click="startCalendarYear(cndr.YearString, cndr._id)"
            >
              Start Year
            </v-btn>

            <v-btn
              v-else-if="!cndr.Days || cndr.Days.length == 0"
              text
              small
              class="ml-2"
              color="accent"
              @click="setupAndStartCalendarYear(cndr.YearString, cndr._id)"
            >
              Setup &amp; Start
            </v-btn>
          </li>
        </ul>
      </v-card-text>
    </v-card>

    <!-- loading overlay -->
    <v-overlay :value="loading">
      <v-progress-circular indeterminate size="68"></v-progress-circular>
    </v-overlay>

    <v-snackbar v-model="toast.show" :timeout="3000" :color="toast.color">
      {{ toast.message }}
    </v-snackbar>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component
export default class Calendar extends Vue {
  private month = '';

  private success = false;

  private loading = false;

  private calendars: any = [];

  private response: any = '';

  private randomMonth = false;

  private showToast = false;
  // TODO: make this a global service!
  private toast = {
    show: false,
    color: 'success',
    message: 'Inside Calendar!',
  };

  get currentDay() {
    return this.$store.state.calendar.CurrentDay;
  }

  get calendar() {
    return this.$store.state.calendar;
  }

  private createNewYear() {
    this.loading = true;

    this.$axios
      .post(`/calendar/new${this.randomMonth ? '?override_month=true' : ''}`)
      .then(response => {
        console.log('Response => ', response);

        this.toast = {
          show: true,
          color: 'success',
          message: 'Calendar created successfully!',
        };

        this.getCalendars();
      })
      .catch(response => {
        console.log('Response => ', response);
      })
      .finally(() => {
        this.loading = false;
      });
  }

  private getCurrentCalendar() {
    this.$axios
      .post('/calendar/current')
      .then(response => {
        console.log('Response => ', response);
      })
      .catch(response => {
        console.log('Response => ', response);
      });
  }

  private getCalendars() {
    this.$axios
      .get('/calendar/calendars')
      .then(response => {
        this.calendars = response.data.payload;
      })
      .catch(response => {
        console.log('Response => ', response);
      });
  }

  private getCompetitions() {
    this.$axios
      .get('/seasons?started=false')
      .then(response => {
        this.calendars = response.data.payload;
      })
      .catch(response => {
        console.log('Response => ', response);
      });
  }

  // TODO: make this page more usefule and add more feedback for users...

  private startCalendarYear(year: string, id: string) {
    this.loading = true;
    this.$axios
      .post(`/calendar/${year}/${id}/start`)
      .then(response => {
        console.log(
          'Yup! Calendar started successfully!',
          response.data.payload
        );
        this.success = true;
        this.response = response.data;

        this.toast = {
          show: true,
          color: 'success',
          message: 'Year started successfully!',
        };

        this.$store.dispatch('SET_CALENDAR');
      })
      .catch(response => {
        console.log('Response => ', response);
      })
      .finally(() => {
        this.loading = false;
      });
  }

  private setupAndStartCalendarYear(year: string, id: string) {
    this.loading = true;
    this.$axios
      .post(`/calendar/${year}/${id}/setup-and-start`)
      .then(response => {
        console.log(
          'Yup! Calendar started successfully!',
          response.data.payload
        );
        this.success = true;
        this.response = response.data;

        this.toast = {
          show: true,
          color: 'success',
          message: 'Calendar Year setup & started successfully!',
        };

        this.$store.dispatch('SET_CALENDAR');
      })
      .catch(response => {
        console.log('Response => ', response);

        this.toast = {
          show: true,
          color: 'error',
          message: 'Error setting up & starting Year!',
        };
      })
      .finally(() => {
        this.loading = false;
      });
  }

  mounted() {
    this.getCalendars();
  }
}
</script>
