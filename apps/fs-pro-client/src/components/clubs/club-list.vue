<template>
  <v-card tile elevation="1">
    <v-list>
      <v-list-item class="d-flex justify-content-between rounded-1">
        Clubs
        <v-spacer></v-spacer>
        <b>{{ clubs ? clubs.length : 'undefined' }}</b>
      </v-list-item>
      <v-list-item v-for="(club, i) in clubs" :key="i" color="#7535ed" link>
        <template v-slot:prepend>
          <v-avatar>
            <v-img
              :src="`${api}/img/clubs/logos/${club.ClubCode}.png`"
              width="40px"
            ></v-img>
          </v-avatar>
        </template>
        <v-list-item-title v-text="club.Name"></v-list-item-title>
      </v-list-item>
    </v-list>

    <v-divider></v-divider>

    <v-card-actions v-if="actions">
      <v-spacer></v-spacer>

      <v-btn
        @click="addClub"
        variant="text"
        icon
        color="primary-lighten-2"
        class="mr-3"
      >
        <v-icon size="small">mdi-plus</v-icon>
        Add
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Club } from '@/interfaces/club';
import { apiUrl } from '@/store';

interface Props {
  clubs: Club[];
  actions?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  actions: false,
});

const emit = defineEmits<{
  'open-club-modal': [];
}>();

const api = ref<string>(apiUrl);

const addClub = (): void => {
  emit('open-club-modal');
};
</script>

<style></style>
