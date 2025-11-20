<template>
  <v-card>
    <v-card-title>
      Add Player to Club
      <v-spacer></v-spacer>

      <v-text-field
        :model-value="search"
        @update:model-value="search = $event"
        append-icon="mdi-magnify"
        label="Search"
        single-line
        hide-details
      ></v-text-field>
    </v-card-title>

    <v-data-table
      :headers="headers"
      :items="players"
      :model-value="selectedPlayer"
      @update:model-value="selectedPlayer = $event"
      item-key="_id"
      show-select
      :search="search"
      loading-text="Fetching Players..."
      no-data-text="No Players"
      class="elevation-1"
    >
      <template v-slot:top>
        <v-switch
          :model-value="singleSelect"
          @update:model-value="singleSelect = $event"
          label="Single select"
          class="pa-3"
        ></v-switch>
      </template>

      <template v-slot:item.Id="{ item }">
        <v-avatar v-if="item.ClubCode" size="40">
          <v-img :src="`${api}/img/clubs/kit/${item.ClubCode}-kit.png`"></v-img>
        </v-avatar>
      </template>

      <!-- Player's Country -->
      <!-- <template v-slot:item.Country="{ item }">
        {{ item.Nationality ? item.Nationality.Name : "-" }}
      </template> -->

      <template v-slot:item.Rating="{ item }">
        <v-chip :color="getColor(item.Rating)">
          {{ Math.round(item.Rating) }}
        </v-chip>
      </template>
    </v-data-table>
    <v-divider></v-divider>
    <v-card-actions>
      <v-spacer></v-spacer>
      <v-btn color="secondary" @click="close">Close</v-btn>
      <v-btn color="success" v-if="selectedPlayer[0]" @click="addPlayer">
        Add
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { ref, onMounted, getCurrentInstance } from 'vue';
import { Player } from '@/interfaces/player';
import { apiUrl } from '@/store';

const instance = getCurrentInstance();
const $axios = instance?.appContext.config.globalProperties.$axios;

const emit = defineEmits<{
  'close-players-modal': [playerIds?: string[]];
}>();

const api = ref(apiUrl);
const players = ref<any[]>([]);
const selectedPlayer = ref<Player[] | []>([]);
const singleSelect = ref(false);
const search = ref('');
const ClubCode = ref('');
const isSigned = ref<boolean | null>(null);

const headers = ref<any[]>([
  {
    title: 'Id',
    align: 'start',
    key: 'Id',
  },
  {
    title: 'First Name',
    key: 'FirstName',
  },
  {
    title: 'Last Name',
    key: 'LastName',
  },
  { title: 'Club', key: 'ClubCode', filterable: true },
  { title: 'Age', key: 'Age', filterable: true },
  { title: 'Position', key: 'Position', filterable: true },
  { title: 'Role', key: 'Role', filterable: true },
  { title: 'Country', key: 'Nationality.Name', filterable: true },
  { title: 'Value', key: 'Value', filterable: false },
  { title: 'Rating', key: 'Rating', filterable: true },
]);

const getColor = (rating: number): string => {
  if (rating >= 80) return 'green';
  else if (rating >= 50) return 'orange';
  else return 'red';
};

const addPlayer = (): void => {
  // get array of Ids
  const playerIds = selectedPlayer.value.map((p: any) => p._id);
  emit('close-players-modal', playerIds);
  selectedPlayer.value = [];
};

const close = (): void => {
  emit('close-players-modal');
};

onMounted(() => {
  const options = JSON.stringify({ isSigned: false });
  $axios
    .get(`/players/all?options=${options}`)
    .then((res: any) => {
      players.value = res.data.payload as Player[];
    })
    .catch((err: any) => {
      console.log('Error! => ', err);
    });
});
</script>

<style></style>
