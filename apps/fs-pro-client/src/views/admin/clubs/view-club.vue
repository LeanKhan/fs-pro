<template>
  <div>
    <v-dialog v-model="openPlayersModal" persistent max-width="900px">
      <all-players-table @close-players-modal="closeModal"></all-players-table>
    </v-dialog>
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-toolbar flat color="amber darken-1">
            <v-btn icon @click="goBack">
              <v-icon>mdi-arrow-left</v-icon>
            </v-btn>
            <v-toolbar-title class="ml-1">Club</v-toolbar-title>
            <v-spacer></v-spacer>

            <v-btn :disabled="!shouldReload" @click="fetchClub" icon color="white">
              <v-icon>mdi-reload</v-icon>
            </v-btn>
          </v-toolbar>
        </v-card>
      </v-col>
    </v-row>

    <v-row>
      <v-col>
        <v-card class="justify-space-between">
          <v-row>
            <v-col cols="2" class="p-3">
              <v-img :src="`${apiUrl}/img/clubs/logos/${club.ClubCode}.png`" width="200"></v-img>
            </v-col>

            <v-col cols="6">
              <div class="title">
                <span class="subtitle-1 grey--text">Name:</span>
                {{ club ? club.Name : 'N/A' }}
                <span class="grey--text">{{ club.ClubCode }}</span>
              </div>

              <div v-if="club.Manager && club.Manager.FirstName" class="title">
                <span class="subtitle-1 grey--text">Manager:</span>
                {{ club.Manager.FirstName }} {{ club.Manager.LastName }}
              </div>
              <div v-else class="title">
                <span class="subtitle-1 grey--text">Manager:</span>
                No Manager
              </div>

              <div class="title">
                <span class="subtitle-1 grey--text">League:</span>
                {{ club.LeagueCode }}
              </div>

              <div class="title">
                <span class="subtitle-1 grey--text">Stadium:</span>
                <span>{{ club.Stadium?.Name }}</span>
                &nbsp;
                <span class="grey--text">{{ club.Stadium?.Location }}</span>
              </div>

              <div class="title">
                <span class="subtitle-1 grey--text">Rating:</span>
                <v-rating
                  :value="clubRating"
                  :half-increments="true"
                  :readonly="true"
                  color="amber darken-1"
                  background-color="secondary lighten-1"
                ></v-rating>
                <span class="font-italic success--text">{{ clubRating }}</span>
              </div>
            </v-col>

            <v-col>
              <v-sheet class="v-sheet--offset" color="secondary" elevation="10">
                <v-sparkline
                  :labels="labels"
                  :value="value"
                  line-width="2"
                  color="ember darken-3"
                ></v-sparkline>
              </v-sheet>
            </v-col>
          </v-row>
        </v-card>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12">
        <players-table
          @add-player="openPlayersModal = true"
          @remove-player="removePlayer"
          :players="allPlayers"
          :viewClub="true"
        ></players-table>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useStore, apiUrl} from '@/store';
import { $axios } from '@/main';
import PlayersTable from '@/components/players/players-table.vue';
import AllPlayersTable from '@/components/players/allplayers-table.vue';
import type { Club } from '@/interfaces/club';

const router = useRouter();
const route = useRoute();
const store = useStore();

const club = ref<any>({});
const openPlayersModal = ref(false);
const shouldReload = ref(false);
const labels = ref(['GK', 'DEF', 'MID', 'ATT']);
const value = ref([5, 0, 0, 0]);

const clubRating = computed(() => {
  if (club.value.Rating) {
    return Math.round(club.value.Rating) / 20;
  }
  return 0;
});

const allPlayers = computed(() => {
  if (club.value.Players) {
    return club.value.Players;
  }
  return [];
});

function goBack() {
  router.back();
}

function closeModal(playerIds: string[]) {
  openPlayersModal.value = false;
  if (playerIds) {
    signPlayer(playerIds);
  }
}

async function signPlayer(playerIds: string[]) {
  const clubId = route.params.id;
  const clubCode = route.params.code;
  const isSigned = false;

  try {
    await $axios.put(`/clubs/${clubId}/add-many-players`, {
      data: { playerIds, clubCode, isSigned, clubId }
    });

    store.showToast({
      message: 'Player(s) signed successfully',
      style: 'success',
    });

    fetchPlayers();
  } catch (error) {
    console.error('Error signing player:', error);
    store.showToast({
      message: 'Error signing Player',
      style: 'error',
    });
  }
}

async function removePlayer(playerId: string) {
  const clubId = route.params.id;
  const clubCode = route.params.code;
  const isSigned = true;

  try {
    await $axios.put(`/clubs/${clubId}/remove-player?remove=true`, {
      data: { playerId, clubCode, isSigned }
    });

    store.showToast({
      message: 'Player removed successfully',
      style: 'success',
    });

    fetchPlayers();
  } catch (error) {
    console.error('Error removing player:', error);
    store.showToast({
      message: 'Error removing Player',
      style: 'error',
    });
  }
}

async function fetchClub() {
  const clubId = route.params.id;
  const populate = JSON.stringify([{ path: 'Players' }, { path: 'Manager' }]);

  try {
    const response = await $axios.get(`/clubs/${clubId}?populate=${populate}`);
    if (response.data.success) {
      club.value = response.data.payload;
    }
  } catch (error) {
    console.error('Error fetching club:', error);
    store.toggleErrorOverlay();
  } finally {
    shouldReload.value = false;
  }
}

async function fetchPlayers() {
  const clubId = route.params.id;
  const query = JSON.stringify({ ClubCode: club.value.ClubCode });

  try {
    const response = await $axios.get(`/players/all?options=${query}`);
    if (response.data.success) {
      club.value.Players = response.data.payload;
    }
  } catch (error) {
    console.error('Error fetching players:', error);
    store.toggleErrorOverlay();
  } finally {
    shouldReload.value = false;
  }
}

onMounted(() => {
  fetchClub();
});
</script>