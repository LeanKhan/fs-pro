<template>
  <div>
    <v-dialog v-model="openClubModal" persistent max-width="800px">
      <clubs-table @close-club-modal="closeModal"></clubs-table>
    </v-dialog>
    <v-row>
      <v-col cols="6">
        <!-- Competition Details -->
        <v-card>
          <v-list-item>
            <v-list-item-title class="headline mb-1">
              <div class="overline mb-4">
                {{ competition.CompetitionID }}
              </div>
              {{ competition.Name }}
              <v-chip>{{ competition.Type }}</v-chip>
            </v-list-item-title>
            <v-list-item-content>
              <v-btn text icon color="indigo lighten-2">
                <v-icon small @click="updateCompetition">
                  mdi-pencil
                </v-icon>
              </v-btn>
            </v-list-item-content>
          </v-list-item>

          <v-card-text>
            Country: {{ competition.Country.Name }} Type: {{ competition.Type }}
          </v-card-text>

          <v-divider></v-divider>
          <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn text small color="indigo" to="./seasons">
              <v-icon color="indigo">
                mdi-calendar
              </v-icon>
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

<script lang="ts">
import { defineComponent, ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ClubList from '@/components/clubs/club-list.vue';
import SeasonsTable from '@/components/seasons/seasons-table.vue';
import ClubsTable from '@/components/clubs/clubs-table.vue';
import { Competition } from '@/interfaces/competition';
import axios from 'axios';

export default defineComponent({
  name: 'ViewComponent',
  components: {
    ClubList,
    SeasonsTable,
    ClubsTable,
  },
  setup() {
    const route = useRoute();
    const router = useRouter();
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

        axios
          .post(`/competitions/${competitionID}/add-club`, {
            clubId: event.id,
            leagueCode: compCode,
          })
          .then(response => {
            console.log('Successfully added club to competition => ', response);
          })
          .catch(response => {
            console.log('Error deleting comp =>', response.data);
          });
      }
    };

    onMounted(() => {
      const compID = route.params['id'];

      axios
        .get(`/competitions/${compID}`)
        .then(response => {
          console.log('Fetched Competition => ', response.data);
          if (response.data.success) {
            competition.value = response.data.payload as Competition;
          }
        })
        .catch(response => {
          console.log('Response => ', response);
        });
    });

    return {
      competition,
      openClubModal,
      updateCompetition,
      closeModal,
    };
  },
});
</script>

<style></style>
