<template>
  <div class="container">
    <v-row>
      <v-col cols="4">
        <v-card class="mx-auto" max-width="300" tile elevation="1">
          <v-list>
            <v-subheader>Competitions</v-subheader>
            <v-list-item-group color="primary">
              <v-list-item
                v-for="(competition, i) in competitions"
                :key="i"
                color="#7535ed"
                @click="showCompetition(competition.CompetitionCode)"
                link
              >
                <v-list-item-avatar>
                  <v-img
                    :src="`${api}/img/logos/${competition.CompetitionCode}.png`"
                    width="40px"
                  ></v-img>
                </v-list-item-avatar>
                <v-list-item-content>
                  <v-list-item-title
                    v-text="competition.Name"
                  ></v-list-item-title>
                </v-list-item-content>
              </v-list-item>
            </v-list-item-group>
          </v-list>
        </v-card>
      </v-col>

      <v-col cols="8">
        <v-card tile elevation="1" v-if="selectedCompetition.CompetitionID">
          <v-card-title>
            Selected Competition
          </v-card-title>

          <v-list-item three-line>
            <v-list-item-content>
              <!-- <div class="overline mb-4">
                Squad Size: {{ selectedClub.Players.length }}
              </div> -->
              <v-list-item-title class="headline mb-1">
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
            </v-list-item-content>

            <v-list-item-avatar tile size="80">
              <v-img
                :src="
                  `${api}/img/clubs/logos/${selectedCompetition.CompetitionCode}.png`
                "
              ></v-img>
            </v-list-item-avatar>
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
          <v-card-text class="text-center">
            No selected competition
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Competition } from '@/interfaces/competition';
import { apiUrl } from '@/store';

@Component({})
export default class AllCompetitions extends Vue {
  private competitions: Competition[] = [];

  public selectedCompetition: any = {};

  public api: string = apiUrl;

  public showCompetition(compCode: string): void {
    const competition = this.competitions.find(
      c => c.CompetitionCode == compCode
    );

    if (competition) {
      this.selectedCompetition = competition;
    }
  }

  public mounted() {
    this.$axios
      .get('/competitions/all')
      .then(res => {
        this.competitions = res.data.payload;
      })
      .catch(err => {
        console.log('Error! => ', err);
      });
  }
}
</script>

<style></style>
