<template>
  <div class="container">
    <v-row>
      <v-col cols="4">
        <v-card class="mx-auto" max-width="300" tile elevation="1">
          <v-list>
            <v-subheader>Clubs</v-subheader>
            <v-list-item-group color="primary">
              <v-list-item
                v-for="(club, i) in clubs"
                :key="i"
                color="#7535ed"
                @click="showClub(club.ClubCode)"
                link
              >
                <v-list-item-avatar>
                  <v-img
                    :src="`${api}/img/clubs/logos/${club.ClubCode}.png`"
                    width="40px"
                  ></v-img>
                </v-list-item-avatar>
                <v-list-item-content>
                  <v-list-item-title>{{ club.Name }}</v-list-item-title>
                </v-list-item-content>
              </v-list-item>
            </v-list-item-group>
          </v-list>
        </v-card>
      </v-col>

      <v-col cols="8">
        <v-card tile elevation="1" v-if="selectedClub.Name">
          <v-card-title>
            Selected Club
          </v-card-title>

          <v-list-item three-line>
            <v-list-item-content>
              <div class="overline mb-4">
                Squad Size: {{ selectedClub.Players.length }}
              </div>
              <v-list-item-title class="headline mb-1">
                {{ selectedClub.Name }}
                <v-chip>{{ selectedClub.ClubCode }}</v-chip>
              </v-list-item-title>
              <v-list-item-subtitle>
                <b>Manager:</b>
                {{ selectedClub.Manager }}
                <b>Stadium:</b>
                {{ selectedClub.Stadium.Name }}
              </v-list-item-subtitle>
            </v-list-item-content>

            <v-list-item-avatar tile size="80">
              <v-img
                :src="`${api}/img/logos/${selectedClub.ClubCode}.png`"
              ></v-img>
            </v-list-item-avatar>
          </v-list-item>

          <v-divider light />

          <h5>Players</h5>

          <v-list>
            <v-list-item v-for="(player, i) in selectedClub.Players" :key="i">
              {{ player.FirstName }} {{ player.LastName }}
            </v-list-item>
          </v-list>
        </v-card>

        <v-card v-else>
          <v-card-text class="text-center">
            No selected club
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Club } from '@/interfaces/club';
import { apiUrl } from '@/store';
import { $axios } from '@/main';

const clubs = ref<Club[]>([]);
const api = ref<string>(apiUrl);
const selectedClub = ref<any>({});


const showClub = (clubCode: string): void => {
  const club = clubs.value.find(c => c.ClubCode == clubCode);
  if (club) {
    selectedClub.value = club;
  }
};

onMounted(() => {
  $axios
    .get('/clubs/all')
    .then(res => {
      clubs.value = res.data.payload;
    })
    .catch(err => {
      console.log('Error! => ', err);
    });
});
</script>

<style></style>
