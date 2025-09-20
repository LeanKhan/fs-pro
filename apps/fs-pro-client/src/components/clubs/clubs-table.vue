<template>
  <v-card>
    <v-card-title>
      Add Club to competition
      <v-spacer></v-spacer>

      <v-text-field
        v-model="search"
        append-icon="mdi-magnify"
        label="Search"
        single-line
        hide-details
      ></v-text-field>
    </v-card-title>

    <v-data-table
      :headers="headers"
      :items="clubs"
      v-model="selectedClub"
      item-key="ClubCode"
      show-select
      :single-select="true"
      :search="search"
      loading-text="Fetching Clubs..."
      no-data-text="No Clubs"
      class="elevation-1"
    >
      <!-- <template v-slot:item.Actions="{ item }">
        <v-btn text icon color="success lighten-2">
          <v-icon small @click="viewSeason(item)">
            mdi-eye
          </v-icon>
        </v-btn>
        <v-btn text icon color="blue lighten-2">
          <v-icon small @click="editSeason(item)">
            mdi-pencil
          </v-icon>
        </v-btn>
      </template> -->

      <template v-slot:item.Address="{ item }">
        {{ item.Address.City }}, {{ item.Address.Country.Name }}
      </template>

      <template v-slot:item.Stadium="{ item }">
        {{ item.Stadium.Name }}
      </template>

      <template v-slot:item.Players="{ item }">
        {{ item.Players.length }}
      </template>
    </v-data-table>
    <v-divider></v-divider>
    <v-card-actions>
      <v-spacer></v-spacer>
      <v-btn color="secondary" @click="close">
        Close
      </v-btn>
      <v-btn color="success" v-if="selectedClub[0]" @click="addClub">
        Add
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useNuxtApp } from '#app';
import { Club } from '@/interfaces/club';

const clubs = ref<any[]>([]);
const selectedClub = ref<Club[] | []>([]);
const search = ref('');

const { $axios } = useNuxtApp();

const emit = defineEmits<{
  'close-club-modal': [payload?: { id: string; name: string }];
}>();

const headers = ref<any[]>([
  {
    text: 'Code',
    align: 'start',
    value: 'ClubCode',
  },
  {
    text: 'Name',
    value: 'Name',
  },
  { text: 'Address', value: 'Address', filterable: true, sortable: true },
  { text: 'Manager', value: 'Manager', filterable: true, sortable: false },
  { text: 'Stadium', value: 'Stadium', filterable: true, sortable: false },
  { text: 'League', value: 'LeagueCode', filterable: true, sortable: true },
  { text: 'Players', value: 'Players', filterable: true, sortable: true },
]);

const addClub = (): void => {
  emit('close-club-modal', {
    id: selectedClub.value[0]._id,
    name: selectedClub.value[0].Name,
  });
};

const close = (): void => {
  emit('close-club-modal');
};

onMounted(() => {
  $axios
    .get('/clubs/all')
    .then(res => {
      clubs.value = res.data.payload as Club[];
    })
    .catch(err => {
      console.log('Error! => ', err);
    });
});
</script>

<style></style>
