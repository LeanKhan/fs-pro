<template>
  <div>
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-toolbar flat color="amber darken-1">
            <v-toolbar-title class="ml-1">Dashboard</v-toolbar-title>

            <v-spacer></v-spacer>

            <v-btn append-icon="mdi-plus" color="success" to="./clubs/new">
              New
            </v-btn>
          </v-toolbar>
        </v-card>
      </v-col>

      <v-col cols="12">
        <all-clubs-table :clubs="clubs"></all-clubs-table>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { $axios } from '@/main';
import type { Club } from '@/interfaces/club';
import AllClubsTable from '@/components/clubs/allclubs-table.vue';

const clubs = ref<Club[]>([]);

onMounted(async () => {
  try {
    const response = await $axios.get('/clubs/all');
    clubs.value = response.data.payload as Club[];
  } catch (error) {
    console.error('Error fetching clubs:', error);
  }
});
</script>
