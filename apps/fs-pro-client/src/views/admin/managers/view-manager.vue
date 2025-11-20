<template>
  <div>
    <v-card>
      <v-toolbar flat color="indigo-darken-1">
        <v-btn icon @click="goBack">
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
        <v-toolbar-title class="ml-1">View Manager</v-toolbar-title>
      </v-toolbar>
    </v-card>

    <v-container>
      <v-card>
        <v-card-text>
          {{ manager.FirstName }} {{ manager.LastName }}
        </v-card-text>
      </v-card>
    </v-container>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { $axios } from '@/main';

const router = useRouter();
const route = useRoute();
const manager = ref<any>({});

function goBack() {
  router.back();
}

onMounted(async () => {
  const managerId = route.params.id;
  try {
    const response = await $axios.get(`/managers/${managerId}`);
    manager.value = response.data.payload;
  } catch (error) {
    console.error('Error fetching manager:', error);
  }
});
</script>
