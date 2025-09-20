<template>
  <v-card elevation="2" class="pa-2 my-4" color="green accent-3">
    <v-toolbar>
      Awards
      <v-icon>mdi-trophy</v-icon>
    </v-toolbar>
    <v-card-text class="white">
      <v-window
        :model-value="step"
        @update:model-value="step = $event"
        reverse
        :continuous="true"
        :show-arrows="true"
        show-arrows-on-hover
      >
        <v-window-item v-for="(award, i) in awards" :key="i">
          <v-card>
            <v-img
              :src="`${api}/img/clubs/kits/${award.Club.ClubCode}-kit.png`"
              width="100px"
            ></v-img>
            <v-card-title>
              {{ award.Name }}
            </v-card-title>
            <v-card-subtitle>
              {{ award.Recipient.FirstName }} {{ award.Recipient.LastName }}
            </v-card-subtitle>
          </v-card>
        </v-window-item>
      </v-window>
    </v-card-text>
    <v-overlay :model-value="loading">
      <v-progress-circular indeterminate size="68"></v-progress-circular>
    </v-overlay>
  </v-card>
</template>

<script setup lang="ts">
/* eslint-disable @typescript-eslint/camelcase */
import { ref, getCurrentInstance } from 'vue';
import { apiUrl } from '@/store';

interface Props {
  seasonId: string;
}

const props = defineProps<Props>();

const instance = getCurrentInstance();
const $axios = instance?.appContext.config.globalProperties.$axios;

// after end of season, check if the Year is also over (that is, all the seasons are finished...)
// then go to End Of Year...

const api = ref(apiUrl);
const step = ref(0);
const loading = ref(false);
const awards = ref<any[]>([]);
const manager = ref<any>({});

/**
 * Fetch Awards
 */
const fetchAwards = () => {
  loading.value = true;

  $axios
    .get(`/awards/season/${props.seasonId}?recipient=player&populate=club`)
    .then((response: any) => {
      const managerIndex = response.data.payload.findIndex((a: any) => !a.Recipient);
      manager.value = response.data.payload.splice(managerIndex, 1);
      awards.value = response.data.payload;
    })
    .catch((err: any) => {
      console.log('Error fetching Season => ', err);
    })
    .finally(() => {
      loading.value = false;
    });
};

// Expose fetchAwards function so parent components can call it
defineExpose({
  fetchAwards
});

//   onMounted(() => {
//     fetchAwards();
//   });
</script>

<style></style>
