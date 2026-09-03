<template>
  <div class="motm">
    <button
      v-if="!loadMOTM"
      class="motm-btn"
      :disabled="loading"
      @click="getMOTM()"
    >
      {{ loading ? 'Loading...' : 'Load' }}
    </button>

    <div v-else-if="loadMOTM && player" class="motm-player">
      <span class="motm-star">★</span>
      {{ player.FirstName }} {{ player.LastName }}
    </div>

    <div v-else class="motm-empty">Could not load MOTM Data</div>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import type { Player } from '@repo/api-contract';
import { client } from '@/services/api';

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
    client.players.getPlayer
      .query({ params: { id: props.motm_id } })
      .then((response) => {
        if (response.status === 200) {
          player.value = response.body.payload;
          loadMOTM.value = true;
        }
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

<style scoped>
.motm {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}
.motm-btn {
  font-size: 12px;
  font-weight: 700;
  background: transparent;
  color: #eef3ec;
  border: 1px solid #23392c;
  border-radius: 6px;
  padding: 8px 16px;
  cursor: pointer;
}
.motm-btn:hover {
  border-color: #e9b34a;
}
.motm-player {
  font-size: 14px;
  font-weight: 700;
}
.motm-star {
  color: #e9b34a;
  margin-right: 4px;
}
.motm-empty {
  opacity: 0.6;
  font-size: 13px;
}
</style>
