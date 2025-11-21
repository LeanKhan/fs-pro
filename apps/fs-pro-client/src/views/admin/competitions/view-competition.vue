<template>
  <div>
    <v-dialog :model-value="openClubModal" persistent max-width="800px">
      <clubs-table @close-club-modal="closeModal"></clubs-table>
    </v-dialog>
    <v-row>
      <v-col cols="6">
        <!-- Competition Details -->
        <v-card>
          <v-list-item>
            <template v-slot:append>
              <v-btn variant="text" icon color="indigo-lighten-2">
                <v-icon size="small" @click="updateCompetition">
                  mdi-pencil
                </v-icon>
              </v-btn>
            </template>
            <v-list-item-title class="text-h5 mb-1">
              <div class="text-overline mb-4">
                {{ competition.CompetitionID }}
              </div>
              {{ competition.Name }}
              <v-chip>{{ competition.Type }}</v-chip>
            </v-list-item-title>
          </v-list-item>

          <v-card-text>
            Country: {{ competition.Country?.Name }} Type: {{ competition.Type }}
          </v-card-text>

          <v-divider></v-divider>
          <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn variant="text" size="small" color="indigo" to="./seasons">
              <v-icon color="indigo">mdi-calendar</v-icon>
              View Seasons
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>

      <!-- Clubs -->
      <v-col cols="6">
        <club-list
          @open-club-modal="openClubModal = true"
          :actions="true"
          :clubs="competition.Clubs"
        ></club-list>
      </v-col>
    </v-row>

    <!-- Competition's Seasons -->

    <v-row>
      <v-col cols="12">
        <!-- seasons -->
        <seasons-table
          :seasons="competition.Seasons"
          :competition-id="competition._id"
        ></seasons-table>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, getCurrentInstance } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ClubList from '@/components/clubs/club-list.vue';
import SeasonsTable from '@/components/seasons/seasons-table.vue';
import ClubsTable from '@/components/clubs/clubs-table.vue';
import { Competition } from '@/interfaces/competition';

const route = useRoute();
const router = useRouter();
const instance = getCurrentInstance();
const $axios = instance?.appContext.config.globalProperties.$axios;

const competition = ref<any>({});
const openClubModal = ref(false);

const updateCompetition = () => {
  const code = competition.value.CompetitionCode.toLowerCase();
  const id = competition.value._id?.toLowerCase();
  router.push({ name: 'Update Competition', params: { id, code } });
};

const closeModal = (event: any) => {
  openClubModal.value = false;
  if (event) {
    const competitionID = route.params['id'];
    const compCode = (route.params['code'] as string).toUpperCase();

    $axios
      .post(`/competitions/${competitionID}/add-club`, {
        clubId: event.id,
        leagueCode: compCode,
      })
      .then((response: any) => {
        console.log('Successfully added club to competition => ', response);
      })
      .catch((response: any) => {
        console.log('Error deleting comp =>', response.data);
      });
  }
};

onMounted(() => {
  const compID = route.params['id'];

  $axios
    .get(`/competitions/${compID}`)
    .then((response: any) => {
      console.log('Fetched Competition => ', response.data);
      if (response.data.success) {
        competition.value = response.data.payload as Competition;
      }
    })
    .catch((response: any) => {
      console.log('Response => ', response);
    });
});
</script>

<style></style>
