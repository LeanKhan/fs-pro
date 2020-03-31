<template>
  <div>
    <v-row>
      <v-col cols="6">
        <!-- DIALOG -->
        <v-dialog v-model="openClubModal" persistent max-width="800px">
          <clubs-table @close-club-modal="closeModal"></clubs-table>
        </v-dialog>
        <!-- DIALOG -->
        <!-- Competition Details -->
        <v-card>
          <v-card-title class="justify-content-between">
            <v-list-item three-line>
              <v-list-item-content>
                <div class="overline mb-4">
                  {{ competition.CompetitionID }}

                  <v-spacer></v-spacer>

                  <v-btn text icon color="secondary lighten-2">
                    <v-icon small @click="updateCompetition">
                      mdi-pencil
                    </v-icon>
                  </v-btn>

                  <v-btn text icon color="danger lighten-2">
                    <v-icon small @click="updateCompetition">
                      mdi-bin
                    </v-icon>
                  </v-btn>
                </div>
                <v-list-item-title class="headline mb-1">
                  {{ competition.Name }}
                  <v-chip>{{ competition.Type }}</v-chip>
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
                    `http://localhost:3000/img/competitions/logos/${competition.CompetitionCode}.png`
                  "
                ></v-img>
              </v-list-item-avatar>
            </v-list-item>
          </v-card-title>

          <v-card-text>
            Country: {{ competition.Country }} Type: {{ competition.Type }}
          </v-card-text>
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
        <seasons-table :seasons="competition.Seasons"></seasons-table>
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import ClubList from '../../components/clubs/club-list.vue';
import SeasonsTable from '@/components/competitions/seasons-table.vue';
import ClubsTable from '@/components/clubs/clubs-table.vue';
import { Competition } from '../../models/competition';

@Component({
  components: {
    ClubList,
    SeasonsTable,
    ClubsTable,
  },
})
export default class ViewComponent extends Vue {
  private competition: any = {};

  private openClubModal = false;

  public updateCompetition(): void {
    const compCode = this.competition.CompetitionCode.toLowerCase();
    const compID = this.competition._id?.toLowerCase();

    this.$router.push(`/competitions/update/${compID}/${compCode}`);
  }

  public closeModal(event: any): void {
    this.openClubModal = false;
    if (event) {
      const competitionID = this.$route.params['id'];
      const compCode = this.$route.params['code'].toUpperCase();

      this.$axios
        .post(`/competitions/${competitionID}/add-club`, {
          clubId: event.id,
          leagueCode: compCode,
        })
        .then(response => {
          console.log('Successfully added club to competition => ', response);
          // this.$router.push('/competitions');
        })
        .catch(response => {
          console.log('Error deleting comp =>', response.data);
        });
    }
  }

  private mounted(): void {
    const compID = this.$route.params['id'];

    this.$axios
      .get(`/competitions/${compID}`)
      .then(response => {
        console.log('Stuff => ', response);
        this.competition = response.data.payload._doc as Competition;
      })
      .catch(response => {
        console.log('Response => ', response);
      });
  }
}
</script>

<style></style>
