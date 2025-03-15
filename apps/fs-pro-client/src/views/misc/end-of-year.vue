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
            @click="endYear"
          >
            End Year Now
          </v-btn>
        </p>

        <p v-else>
          {{ calendar.YearString }} ended successfully! Admin will start a new
          year soon :)

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

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useStore } from '@/store';
import { $axios } from '@/main';

const route = useRoute();
const router = useRouter();
const store = useStore();

const loading = ref(false);
const ended = ref(false);
const calendar = ref<any>({});

function endYear() {
  const ans = confirm('Are you sure you want to end this Year?');
  if (!ans) return false;

  loading.value = true;
  $axios
    .post(`/calendar/${route.params.calendar_id}/end`)
    .then(response => {
      if (response.data.success) {
        console.log(response.data);
        calendar.value = response.data.payload;
        ended.value = true;
        // Set new current Calendar! This should return null...
        store.setCalendar();
      }
    })
    .catch(error => {
      console.log('Error ending Calendar => ', error);
      calendar.value = error;
    })
    .finally(() => {
      loading.value = false;
    });
}

onMounted(() => {
  loading.value = true;
  $axios
    .get('/calendar/current')
    .then(response => {
      calendar.value = response.data.payload;
    })
    .catch(err => {
      console.log('Error fetching current Calendar => ', err);
    })
    .finally(() => {
      loading.value = false;
    });
});
</script>