<template>
  <div>
    <v-card>
      <v-card-title>Manager</v-card-title>
      <v-card-text>
        <template v-if="club.Manager && club.Manager.FirstName">
          {{ club.Manager.FirstName }} {{ club.Manager.LastName }}
        </template>
        <template v-else>
          <p>No manager yet. Hire one!</p>
        </template>
      </v-card-text>
      <v-card-actions>
        <v-btn
          v-if="club.Manager"
          color="error"
          @click="fireManager"
          variant="flat"
        >
          Fire Manager
        </v-btn>
        <v-btn v-else @click="hireManager" color="info" variant="flat">
          Hire Manager
        </v-btn>
      </v-card-actions>
    </v-card>

    <manager-picker
      v-model:show="openManagerPicker"
      @update-available="emit('update-available')"
      :club="club._id"
    ></manager-picker>
    <manager-firer
      v-model:show="openFireManager"
      :manager="club.Manager"
      :club="club._id"
    ></manager-firer>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ManagerPicker, ManagerFirer } from '@/components/clubzone';

defineProps<{
  club: any;
}>();

const emit = defineEmits<{
  (e: 'update-available'): void;
}>();

defineOptions({
  name: 'ClubZone',
});

const openManagerPicker = ref(false);
const openFireManager = ref(false);

function hireManager() {
  openManagerPicker.value = !openManagerPicker.value;
}

function fireManager() {
  openFireManager.value = !openFireManager.value;
}
</script>
