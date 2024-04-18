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
              <v-icon>
                mdi-arrow-left
              </v-icon>
            </v-btn>
            <v-toolbar-title class="ml-1">
              Club
            </v-toolbar-title>
            <v-spacer></v-spacer>

            <v-btn
              :disabled="!shouldReload"
              @click="fetchClub"
              icon
              color="white"
            >
              <v-icon>
                mdi-reload
              </v-icon>
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
              <v-img
                :src="`${apiUrl}/img/clubs/logos/${club.ClubCode}.png`"
                width="200"
              ></v-img>
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
                <span>{{ club.Stadium.Name }}</span>
                &nbsp;
                <span class="grey--text">{{ club.Stadium.Location }}</span>
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

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import PlayersTable from '@/components/players/players-table.vue';
import AllPlayersTable from '@/components/players/allplayers-table.vue';
import { Club } from '@/interfaces/club';

@Component({
  components: {
    PlayersTable,
    AllPlayersTable,
  },
})
export default class ViewClub extends Vue {
  private club: any | Club = {};

  private openPlayersModal = false;

  private shouldReload = false;

  private labels = ['GK', 'DEF', 'MID', 'ATT'];

  private value = [5, 0, 0, 0];

  get allPlayers() {
     if (this.club.Players) {
      return this.club.Players;
    } else {
      return [];
    }
  };

  set allPlayers(players) {
    this.club.Players = players;
  };

  get apiUrl() {
    return this.$store.getters.apiUrl;
  }

  get clubRating() {
    if (this.club.Rating) {
      return Math.round(this.club.Rating) / 20;
    } else {
      return 0;
    }
  }

  private closeModal(playerIds: string[]) {
    this.openPlayersModal = false;
    // add player to club :)
    if (playerIds) {
      this.signPlayer(playerIds);
    }
  }

  private signPlayer(playerIds: string[]) {
    const clubId = this.$route.params['id'];
    const clubCode = this.$route.params['code'];
    const isSigned = false;
    /**
     *     req.body.playerId,
    req.query.player_is_signed,
    req.query.club_code
     */

    const data = { data: { playerIds, clubCode, isSigned, clubId } };

    this.$axios
      .put(`/clubs/${clubId}/add-many-players`, data)
      .then(response => {
        // this.club = response.data.payload;
        // TODO: add toast o! for feedback to user
        this.shouldReload = true;
        console.log('Player added successfully', response.data);

            this.$store.dispatch('SHOW_TOAST', {
          message: 'Player(s) signed successfully',
          style: 'success',
        });

        this.fetchPlayers();
      })
      .catch(response => {
        console.log('Error adding player!', response);

            this.$store.dispatch('SHOW_TOAST', {
          message: 'Error signing Player',
          style: 'error',
        });
      });
  }

  private removePlayer(playerId: string) {
    const clubId = this.$route.params['id'];
    const clubCode = this.$route.params['code'];
    const isSigned = true;
    /**
     *     req.body.playerId,
    req.query.player_is_signed,
    req.query.club_code
     */

    const data = { data: { playerId, clubCode, isSigned } };

    this.$axios
      .put(`/clubs/${clubId}/remove-player?remove=true`, data)
      .then(response => {
        // this.club = response.data.payload;
        // TODO: add toast o! for feedback to user
        this.shouldReload = true;
        console.log('Player removed successfully', response.data);

        this.$store.dispatch('SHOW_TOAST', {
          message: 'Player removed successfully',
          style: 'success',
        });

        this.fetchPlayers();
      })
      .catch(response => {
        console.log('Error removing player!', response);

            this.$store.dispatch('SHOW_TOAST', {
          message: 'Error removing Player',
          style: 'error',
        });
      });
  }

  private goBack(): void {
    this.$router.back();
  }

  private fetchClub(): void {
    const clubId = this.$route.params['id'];

    const populate = JSON.stringify([{ path: 'Players' }, { path: 'Manager' }]);
    this.$axios
      .get(`/clubs/${clubId}?populate=${populate}`)
      .then(response => {
        // Check for errors here o
        if (response.data.success) {
          this.club = response.data.payload;
        }
      })
      .catch(response => {
        console.log('Response => ', response);
        this.$store.commit('TOGGLE_ERROR_OVERLAY');
      })
      .finally(() => {
        this.shouldReload = false;
      });
  }

    private fetchPlayers(): void {
    const clubId = this.$route.params['id'];

    const query = JSON.stringify({ ClubCode: this.club.ClubCode });
    this.$axios
      .get(`/players/all?options=${query}`)
      .then(response => {
        // Check for errors here o
        if (response.data.success) {
          this.allPlayers = response.data.payload;
        }
      })
      .catch(response => {
        console.log('Response => ', response);
        this.$store.commit('TOGGLE_ERROR_OVERLAY');
      })
      .finally(() => {
        this.shouldReload = false;
      });
  }

  private mounted(): void {
    this.fetchClub();
  }
}
</script>

<style></style>
