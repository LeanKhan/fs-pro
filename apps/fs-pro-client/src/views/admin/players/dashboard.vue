<template>
  <div>
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-toolbar flat color="indigo darken-1">
            <v-toolbar-title class="ml-1">Dashboard</v-toolbar-title>
            <v-spacer></v-spacer>
            <v-btn append-icon="mdi-plus" color="success" to="players/new">
              New
            </v-btn>
          </v-toolbar>
        </v-card>
      </v-col>

      <v-col cols="12">
        <players-table :players="players" :viewClub="false"></players-table>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import PlayersTable from '@/components/players/players-table.vue';
import type { Player } from '@/interfaces/player';
import { $axios } from '@/main';

const players = ref<Player[]>([]);

onMounted(async () => {
  try {
    const response = await $axios.get('/players/all');
    players.value = response.data.payload as Player[];
  } catch (error) {
    console.error('Error fetching players:', error);
  }
});
</script>
