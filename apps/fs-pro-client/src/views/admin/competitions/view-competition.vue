<template>
  <div>
    <v-dialog :model-value="openClubModal" persistent max-width="800px">
      <clubs-table @close-club-modal="closeModal"></clubs-table>
    </v-dialog>

    <!-- Competition Overview Header -->
    <v-row>
      <v-col cols="12">
        <v-card elevation="2" class="mb-2">
          <v-list-item class="py-3">
            <template v-slot:prepend>
              <v-avatar size="48" :color="compColor" class="mr-3">
                <v-icon color="white" size="28">{{ compIcon }}</v-icon>
              </v-avatar>
            </template>
            <template v-slot:append>
              <v-btn variant="text" icon color="indigo-lighten-2" @click="updateCompetition">
                <v-icon size="small">mdi-pencil</v-icon>
              </v-btn>
            </template>
            <v-list-item-title class="text-h5 font-weight-bold d-flex align-center flex-wrap gap-2">
              {{ competition.Name }}
              <v-chip size="small" :color="compColor" class="ml-2 font-weight-bold text-uppercase">
                {{ compBadgeLabel }}
              </v-chip>
              <v-chip v-if="activeSeason?.Year" size="small" variant="outlined" color="indigo-lighten-2">
                Season {{ activeSeason.Year }}
              </v-chip>
            </v-list-item-title>
            <v-list-item-subtitle class="text-caption text-grey mt-1">
              Code: <strong class="text-white mr-3">{{ competition.CompetitionCode }}</strong>
              Teams: <strong class="text-white mr-3">{{ competition.Clubs?.length || competition.NumberOfTeams }}</strong>
              Format: <strong class="text-white text-capitalize">{{ competition.Type }}</strong>
            </v-list-item-subtitle>
          </v-list-item>
        </v-card>
      </v-col>
    </v-row>

    <!-- Tournament Mode Views -->
    <template v-if="isCupMode">
      <!-- Cup Competition: Knockout Bracket View -->
      <v-row>
        <v-col cols="12">
          <knockout-bracket
            :fixtures="activeFixtures"
            :title="competition.Name"
            :season="activeSeason"
          />
        </v-col>
      </v-row>
    </template>

    <template v-else-if="isTournamentMode">
      <!-- Continental Champions League: Group Stage & Bracket Tabs -->
      <v-card class="mb-4">
        <v-tabs v-model="tournTab" bg-color="indigo-darken-4" slider-color="amber">
          <v-tab value="groups">
            <v-icon start>mdi-view-grid</v-icon>
            Group Stage
          </v-tab>
          <v-tab value="bracket">
            <v-icon start>mdi-tournament</v-icon>
            Knockout Bracket
          </v-tab>
        </v-tabs>

        <v-window v-model="tournTab" class="pa-4">
          <v-window-item value="groups">
            <group-stage-view
              :standings="activeSeason?.Standings"
              :fixtures="activeFixtures"
            />
          </v-window-item>
          <v-window-item value="bracket">
            <knockout-bracket
              :fixtures="activeFixtures"
              :title="competition.Name + ' Knockouts'"
              :season="activeSeason"
            />
          </v-window-item>
        </v-window>
      </v-card>
    </template>

    <!-- Standard Details: Clubs and Seasons Table -->
    <v-row class="mt-2">
      <!-- Clubs List -->
      <v-col cols="12" md="6">
        <club-list
          @open-club-modal="openClubModal = true"
          :actions="true"
          :clubs="competition.Clubs || []"
        ></club-list>
      </v-col>

      <!-- Seasons List -->
      <v-col cols="12" md="6">
        <seasons-table
          :seasons="competition.Seasons || []"
          :competition-id="competition._id"
        ></seasons-table>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ClubList from '@/components/clubs/club-list.vue';
import SeasonsTable from '@/components/seasons/seasons-table.vue';
import ClubsTable from '@/components/clubs/clubs-table.vue';
import KnockoutBracket from '@/components/competitions/knockout-bracket.vue';
import GroupStageView from '@/components/competitions/group-stage-view.vue';
import { client } from '@/services/api';

const route = useRoute();
const router = useRouter();

const competition = ref<any>({});
const openClubModal = ref(false);
const activeSeason = ref<any>(null);
const activeFixtures = ref<any[]>([]);
const tournTab = ref<'groups' | 'bracket'>('groups');

const isCupMode = computed(() => {
  return (
    competition.value?.Cup === true ||
    competition.value?.Type?.toLowerCase() === 'cup'
  );
});

const isTournamentMode = computed(() => {
  return (
    competition.value?.Tournament === true ||
    competition.value?.Type?.toLowerCase() === 'tournament'
  );
});

const compColor = computed(() => {
  if (isCupMode.value) return 'amber-darken-2';
  if (isTournamentMode.value) return 'indigo';
  return 'teal';
});

const compIcon = computed(() => {
  if (isCupMode.value) return 'mdi-trophy-variant';
  if (isTournamentMode.value) return 'mdi-earth';
  return 'mdi-shield-crown';
});

const compBadgeLabel = computed(() => {
  if (isCupMode.value) return 'Cup Tournament (Knockout)';
  if (isTournamentMode.value) return 'Continental Tournament (Hybrid)';
  return 'League (Round-Robin)';
});

const updateCompetition = () => {
  const code = competition.value.CompetitionCode?.toLowerCase();
  const id = competition.value._id?.toLowerCase();
  router.push({ name: 'Update Competition', params: { id, code } });
};

const closeModal = (event: any) => {
  openClubModal.value = false;
  if (event) {
    const competitionID = String(route.params['id']);
    client.competitions.addClubToCompetition
      .mutation({
        params: { id: competitionID },
        body: { clubId: event.id },
      })
      .then((response) => {
        console.log('Successfully added club to competition => ', response);
      })
      .catch((err: any) => {
        console.log('Error adding club =>', err);
      });
  }
};

async function loadLatestSeasonFixtures(seasons: any[]) {
  if (!seasons || !seasons.length) return;
  // Pick active or latest season
  const latest = seasons[seasons.length - 1];
  activeSeason.value = latest;

  try {
    const res = await client.fixtures.getFixtures.query({
      query: { season: latest._id },
    });
    if (res.status === 200 && res.body.payload) {
      activeFixtures.value = res.body.payload;
    }
  } catch (e) {
    console.error('Error fetching season fixtures:', e);
  }
}

onMounted(() => {
  const compID = String(route.params['id']);

  client.competitions.getCompetition
    .query({ params: { id: compID } })
    .then(async (response) => {
      if (response.status === 200) {
        competition.value = response.body.payload;
        await loadLatestSeasonFixtures(competition.value.Seasons);
      }
    })
    .catch((err: any) => {
      console.log('Error loading competition => ', err);
    });
});
</script>

<style scoped>
.gap-2 {
  gap: 8px;
}
</style>
