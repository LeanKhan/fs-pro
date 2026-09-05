<template>
  <v-card>
    <v-dialog v-model="assignDialog" max-width="420px">
      <v-card>
        <v-card-title>
          Assign {{ assignTarget?.FirstName }} {{ assignTarget?.LastName }} to a Club
        </v-card-title>
        <v-card-text>
          <v-select
            v-model="selectedClubId"
            :items="clubs"
            item-title="Name"
            item-value="_id"
            label="Club"
            :loading="clubsLoading"
          ></v-select>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="secondary" @click="assignDialog = false">Cancel</v-btn>
          <v-btn
            color="success"
            :disabled="!selectedClubId"
            @click="confirmAssignToClub"
          >
            Assign
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-card-title>
      Players
      <v-spacer></v-spacer>
      <v-text-field
        v-model="search"
        append-icon="mdi-magnify"
        color="indigo-darken-1"
        label="Search"
        single-line
        hide-details
        :clearable="true"
      ></v-text-field>
      <v-btn
        v-if="viewClub"
        append-icon="mdi-plus"
        color="success"
        @click="$emit('add-player')"
      >
        Add
      </v-btn>
      <!-- TODO: Add filter for isSigned -->
      <!-- <v-checkbox v-model="isSigned" label="Signed">
        Signed
      </v-checkbox> -->
    </v-card-title>
    <v-data-table
      :headers="headers"
      :items="players"
      :loading="!players"
      no-data-text="No Players fetched"
      no-results-text="No Players"
      :search="search"
      loading-text="Fetching Players..."
      class="elevation-1"
    >
      <template v-slot:item.Id="{ item }">
        <v-img
          position="top"
          :src="`${api}/img/clubs/kits/${item.ClubCode}-kit.png`"
          max-height="50px"
          max-width="120px"
        ></v-img>
      </template>
      <template v-slot:item.Rating="{ item }">
        <v-chip :color="getColor(item.Rating)">
          {{ Math.round(item.Rating) }}
        </v-chip>
      </template>

      <template v-slot:item.Nationality="{ item }">
        {{ item.Nationality ? item.Nationality.Name : '-' }}
      </template>

      <template v-slot:item.Value="{ item }">
        {{ currency(item.Value) }}
      </template>

      <template v-slot:item.isSigned="{ item }">
        <v-chip
          style="background-color: transparent"
          :color="item.isSigned ? 'green' : 'orange'"
        >
          {{ item.isSigned }}
        </v-chip>
      </template>

      <!-- Players actions -->
      <template v-slot:item.Actions="{ item }">
        <v-btn
          @click="viewPlayer(item._id, item.PlayerID)"
          icon
          color="success-lighten-2"
        >
          <v-icon size="small">mdi-eye-outline</v-icon>
        </v-btn>
        <v-btn
          icon
          color="blue-lighten-2"
          @click="updatePlayer(item._id, item.PlayerID)"
        >
          <v-icon size="small">mdi-pencil-outline</v-icon>
        </v-btn>
        <!-- assign to club (master list only - a specific club's own page
        already has its own bulk "Add" flow above) -->
        <v-btn
          v-if="!viewClub && !item.isSigned"
          icon
          color="amber-darken-2"
          title="Assign to Club"
          @click="openAssignDialog(item)"
        >
          <v-icon size="small">mdi-shield-plus-outline</v-icon>
        </v-btn>
        <!-- remove player -->
        <v-btn
          v-if="viewClub"
          @click="removePlayer(item._id)"
          icon
          color="red-lighten-2"
        >
          <v-icon size="small">mdi-delete-outline</v-icon>
        </v-btn>
      </template>
    </v-data-table>
  </v-card>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import type { Player } from '@repo/api-contract';
import { apiUrl, useStore } from '@/store';
import { currency } from '@/helpers/misc';
import { client } from '@/services/api';

interface Props {
  players: Player[];
  viewClub?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  viewClub: false,
});

const emit = defineEmits<{
  'add-player': [];
  'remove-player': [id: string];
  'player-assigned': [];
}>();

const router = useRouter();
const store = useStore();

const api = ref(apiUrl);
const search = ref('');
const isSigned = ref<boolean | null>(null);

const headers = ref<any[]>([
  {
    title: 'First Name',
    key: 'FirstName',
  },
  {
    title: 'Last Name',
    key: 'LastName',
  },
  { title: 'Club', key: 'ClubCode' },
  { title: 'Age', key: 'Age', filterable: false },
  { title: 'Position', key: 'Position', filterable: false },
  { title: 'Role', key: 'Role', filterable: true },
  { title: 'Country', key: 'Nationality', filterable: false },
  { title: 'Value', key: 'Value', filterable: false },
  {
    title: 'Signed',
    key: 'isSigned',
    sortable: false,
    filter: (value: boolean) => {
      if (!isSigned.value) return true;
      return value == isSigned.value;
    },
  },
  { title: 'Rating', key: 'Rating', filterable: false },
  { title: 'Actions', key: 'Actions', filterable: false, sortable: false },
]);

const getColor = (rating: number): string => {
  if (rating >= 80) return 'green';
  else if (rating >= 50) return 'orange';
  else return 'red';
};

const viewPlayer = (id: string, code: string) => {
  router.push({ name: 'View Player', params: { id, code } });
};

const updatePlayer = (id: string, code: string) => {
  router.push({ name: 'Update Player', params: { id, code } });
};

const removePlayer = (id: string) => {
  if (props.viewClub) {
    emit('remove-player', id);
  }
};

const assignDialog = ref(false);
const assignTarget = ref<Player | null>(null);
const clubs = ref<any[]>([]);
const clubsLoading = ref(false);
const selectedClubId = ref<string | null>(null);

const openAssignDialog = async (item: Player) => {
  assignTarget.value = item;
  selectedClubId.value = null;
  assignDialog.value = true;

  if (!clubs.value.length) {
    clubsLoading.value = true;
    try {
      const response = await client.clubs.getClubs.query();
      if (response.status === 200) {
        clubs.value = response.body.payload;
      }
    } catch (error) {
      console.error('Error fetching clubs:', error);
      store.toggleErrorOverlay();
    } finally {
      clubsLoading.value = false;
    }
  }
};

const confirmAssignToClub = async () => {
  const player = assignTarget.value as any;
  const club = clubs.value.find((c) => c._id === selectedClubId.value);
  if (!player || !club) return;

  try {
    await client.clubs.addPlayerToClub.mutation({
      params: { id: club._id },
      body: {
        playerId: player._id,
        isSigned: false,
        clubCode: club.ClubCode,
        clubId: club._id,
      },
    });
    store.showToast({
      message: `${player.FirstName} ${player.LastName} assigned to ${club.Name}`,
      style: 'success',
    });
    assignDialog.value = false;
    emit('player-assigned');
  } catch (error) {
    console.error('Error assigning player to club:', error);
    store.showToast({
      message: 'Error assigning Player to Club',
      style: 'error',
    });
  }
};
</script>
<style scoped></style>
