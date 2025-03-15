<template>
  <div>
    <v-card>
      <v-card-title>
        Manager
      </v-card-title>
      <v-card-text>
        <template v-if="club.Manager && club.Manager.FirstName">
          {{ club.Manager.FirstName }} {{ club.Manager.LastName }}
        </template>
        <template v-else>
          <p>No manager yet. Hire one!</p>
        </template>
      </v-card-text>
      <v-card-actions>
        <v-btn v-if="club.Manager" color="error" @click="fireManager" depressed>
          Fire Manager
        </v-btn>
        <v-btn v-else @click="hireManager" color="info" depressed>
          Hire Manager
        </v-btn>
      </v-card-actions>
    </v-card>

    <manager-picker
      :show.sync="openManagerPicker"
      @update-available="emit('update-available')"
      :club="club._id"
    ></manager-picker>
    <manager-firer
      :show.sync="openFireManager"
      :manager="club.Manager"
      :club="club._id"
    ></manager-firer>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ManagerPicker, ManagerFirer } from '@/components/clubzone';

const props = defineProps<{
  club: any;
}>();

const emit = defineEmits<{
  (e: 'update-available'): void;
}>();

const openManagerPicker = ref(false);
const openFireManager = ref(false);

function hireManager() {
  openManagerPicker.value = !openManagerPicker.value;
}

function fireManager() {
  openFireManager.value = !openFireManager.value;
}
</script>