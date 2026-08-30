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

    <template v-else-if="loadMOTM && player">
      <v-list density="compact">
        <!-- <v-list-item class="text-center center-text justify-center">
          <v-avatar color="yellow">
            <v-icon color="white" size="large">
              mdi-star
            </v-icon>
          </v-avatar>
        </v-list-item> -->

        <v-list-item>
          <template v-slot:prepend>
            <v-avatar tile size="50" color="transparent" class="h3">
              <span class="text-green font-weight-bold">10</span>
            </v-avatar>
          </template>

          <v-list-item-title>
            {{ player.FirstName }}
            {{ player.LastName }}
          </v-list-item-title>
        </v-list-item>
      </v-list>
    </template>

    <v-sheet v-else>Could not load MOTM Data</v-sheet>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import type { Player } from '@/interfaces/player';
import { $axios } from '@/services/api';

interface Props {
  motm_id: string;
}

const props = defineProps<Props>();

defineOptions({
  name: 'MotmWidget',
});

const loading = ref(false);
const loadMOTM = ref(false);
const player = ref<Player | null>(null);

const getMOTM = () => {
  if (props.motm_id) {
    loading.value = true;
    $axios
      .get(`/players/${props.motm_id}/`)
      .then((response: any) => {
        player.value = response.data.payload;
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
