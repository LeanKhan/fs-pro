<template>
  <div>
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-toolbar flat color="indigo darken-1">
            <v-toolbar-title class="ml-1">Dashboard</v-toolbar-title>
            <v-spacer></v-spacer>
            <v-btn append-icon="mdi-plus" color="success" to="/a/managers/new">New</v-btn>
          </v-toolbar>
        </v-card>
      </v-col>

      <v-col cols="12">
        <managers-table :managers="managers"></managers-table>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import ManagersTable from '@/components/managers/managers-table.vue';
import { $axios } from '@/main';

const managers = ref<any[]>([]);

onMounted(async () => {
  try {
    const response = await $axios.get('/managers?populate=Club');
    managers.value = response.data.payload;
  } catch (error) {
    console.error('Error fetching managers:', error);
  }
});
</script>