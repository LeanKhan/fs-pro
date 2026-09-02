<template>
  <div id="end-of-year">
    <v-card>
      <v-card-text class="justify-center text-center">
        <v-card-title>End Year {{ year }} !</v-card-title>
        <p v-if="!ended">
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
          {{ year }} ended successfully! Admin will start a new year soon :)

          <v-btn block color="success" @click="$router.push('/u')">
            Continue
          </v-btn>
        </p>
      </v-card-text>
    </v-card>

    <!-- loading overlay -->
    <v-overlay :model-value="loading">
      <v-progress-circular indeterminate size="68"></v-progress-circular>
    </v-overlay>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { useStore } from '@/store';
import { $axios } from '@/services/api';

const route = useRoute();
const store = useStore();

const loading = ref(false);
const ended = ref(false);
const year = route.params.year as string;

function endYear() {
  const ans = confirm('Are you sure you want to end this Year?');
  if (!ans) return false;

  loading.value = true;
  $axios
    .post(`/calendar/end-season/${year}`)
    .then((response) => {
      if (response.data.success) {
        ended.value = true;
        store.setCalendar();
        store.setSeasons();
      }
    })
    .catch((error) => {
      console.log('Error ending Year => ', error);
    })
    .finally(() => {
      loading.value = false;
    });
}
</script>
