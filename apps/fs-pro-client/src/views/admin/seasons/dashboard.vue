<template>
  <div>
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-card-title>
            Seasons
            <v-spacer></v-spacer>
            <v-btn append-icon="mdi-plus" color="success">Add</v-btn>
          </v-card-title>
        </v-card>
      </v-col>

      <v-col cols="12">
        <seasons-table :seasons="seasons" :competition-id="competitionId"></seasons-table>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { $axios } from '@/main';
import SeasonsTable from '@/components/seasons/seasons-table.vue';
import type { Season } from '@/interfaces/season';

const route = useRoute();
const seasons = ref<Season[]>([]);
const competitionId = ref('undefined');
const search = ref('');

onMounted(async () => {
  const compId = route.params.id as string;
  try {
    const response = await $axios.get(`/competitions/${compId}/seasons/all`);
    seasons.value = response.data.payload as Season[];
  } catch (err) {
    console.error('Error fetching seasons:', err);
  }
});
</script>

<style scoped>
table tr {
  cursor: pointer !important;
}
table tr:active {
  background-color: #3f51b5 !important;
  border-color: #3f51b5 !important;
}
</style>