<template>
  <div class="d-flex justify-center">
    <v-btn
      v-if="!loadMOTM"
      :disabled="loading"
      :loading="loading"
      @click="getMOTM()"
    >
      Load
    </v-btn>

    <template v-else-if="loadMOTM && Player">
      <v-list dense flat tile>
        <!-- <v-list-item class="text-center center-text justify-center">
          <v-list-item-content>
            <v-avatar color="yellow">
              <v-icon color="white" large>
                mdi-star
              </v-icon>
            </v-avatar>
          </v-list-item-content>
        </v-list-item> -->

        <v-list-item>
          <v-list-item-avatar tile size="50px" color="transparent" class="h3">
            <span class="green--text font-weight-bold">10</span>
          </v-list-item-avatar>
          <v-list-item-content class="pa-0">
            <v-list-item-title>
              {{ Player.FirstName }}
              {{ Player.LastName }}
            </v-list-item-title>
          </v-list-item-content>
        </v-list-item>
      </v-list>
    </template>

    <v-sheet v-else>Could not load MOTM Data</v-sheet>
  </div>
</template>
<script setup lang="ts">
import { ref, getCurrentInstance } from 'vue';
import { Player } from '@/interfaces/player';
import { $axios } from '@/main';

interface Props {
  motm_id: string;
}

const props = defineProps<Props>();

const instance = getCurrentInstance();
// const $axios = instance?.appContext.config.globalProperties.$axios;

const loading = ref(false);
const loadMOTM = ref(false);
const Player = ref<any | Player>({});

const getMOTM = () => {
  if (props.motm_id) {
    loading.value = true;
    $axios
      .get(`/players/${props.motm_id}/`)
      .then((response: any) => {
        Player.value = response.data.payload;
        loadMOTM.value = true;
      })
      .catch((response: any) => {
        console.log('Error fetching MOTM player!', response);
      })
      .finally(() => {
        loading.value = false;
      });
  }
};
</script>
