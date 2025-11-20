<template>
  <div class="container">
    <v-row>
      <v-col cols="4">
        <v-card class="mx-auto" max-width="300" elevation="1">
          <v-list>
            <v-list-subheader>Competitions</v-list-subheader>
            <v-list-item
              v-for="(competition, i) in competitions"
              :key="i"
              :value="i"
              color="primary"
              @click="showCompetition(competition.CompetitionCode)"
            >
              <template v-slot:prepend>
                <v-avatar>
                  <v-img
                    :src="`${api}/img/logos/${competition.CompetitionCode}.png`"
                  ></v-img>
                </v-avatar>
              </template>

              <v-list-item-title>
                {{ competition.Name }}
              </v-list-item-title>
            </v-list-item>
          </v-list>
        </v-card>
      </v-col>

      <v-col cols="8">
        <v-card elevation="1" v-if="selectedCompetition.CompetitionID">
          <v-card-title>Selected Competition</v-card-title>

          <v-list-item lines="three">
            <!-- <div class="overline mb-4">
              Squad Size: {{ selectedClub.Players.length }}
            </div> -->
            <v-list-item-title class="text-h5 mb-1">
              {{ selectedCompetition.Name }}
              <v-chip>{{ selectedCompetition.Type }}</v-chip>
            </v-list-item-title>
            <!-- <v-list-item-subtitle>
              <b>Manager:</b>
              {{ selectedClub.Manager }}
              <b>Stadium:</b>
              {{ selectedClub.Stadium.Name }}
            </v-list-item-subtitle> -->
            <!-- TODO: probably add 'Latest Season' -->

            <template v-slot:append>
              <v-avatar tile size="80">
                <v-img
                  :src="`${api}/img/clubs/logos/${selectedCompetition.CompetitionCode}.png`"
                ></v-img>
              </v-avatar>
            </template>
          </v-list-item>

          <v-divider light />

          <h5>Clubs</h5>

          <v-list>
            <v-list-item
              v-for="(club, i) in selectedCompetition.Clubs"
              :key="i"
            >
              {{ club.Name }} [
              <em>{{ club.ClubCode }}</em>
              ]
            </v-list-item>
          </v-list>
        </v-card>

        <v-card v-else>
          <v-card-text class="text-center">No selected competition</v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, getCurrentInstance } from 'vue';
import { Competition } from '@/interfaces/competition';
import { apiUrl } from '@/store';
import { $axios } from '@/main';

const instance = getCurrentInstance();

const competitions = ref<Competition[]>([]);
const selectedCompetition = ref<any>({});
const api = ref<string>(apiUrl);

const showCompetition = (compCode: string): void => {
  const competition = competitions.value.find(
    (c) => c.CompetitionCode == compCode
  );

  if (competition) {
    selectedCompetition.value = competition;
  }
};

onMounted(() => {
  $axios
    .get('/competitions/all')
    .then((res: any) => {
      competitions.value = res.data.payload;
    })
    .catch((err: any) => {
      console.log('Error! => ', err);
    });
});
</script>

<style></style>
