<template>
  <div class="home">
    <v-app-bar app>
          <v-avatar tile size="50px">
                          <v-icon style="font-size: 50px; height: 50px" x-large>
                            ${{ fixture.Home }}
                          </v-icon>
                        </v-avatar>

                        vs

                          <v-badge
        bordered
        bottom
        color="green accent-3"
        dot
        offset-x="10"
        offset-y="10"
      >
    <v-avatar tile size="50px">
                          <v-icon style="font-size: 50px; height: 50px" x-large>
                            ${{ fixture.Away }}
                          </v-icon>
                        </v-avatar>
      </v-badge>

    </v-app-bar>

    <div class="d-flex justify-center align-center" style="height: 400px;">
      <p class="display-2 white--text text-center">Match Zone</p>

      <img
        alt="FsPro Logo :)"
        height="200px"
        :src="`${api}/img/logo-new.png`"
      />
    </div>
  </div>
</template>

<script lang="ts">
// @ is an alias to /src
import { Component, Vue } from 'vue-property-decorator';
import { Socket } from 'vue-socket.io-extended';
import { apiUrl } from '@/store';

@Component({
  name: 'MatchZone',
})
export default class MatchZone extends Vue {
  public api: string = apiUrl;

  public fixtureId! = '';

  private fixture!: any = {};

  private currentMatch!: any = {};

    /** Sockets */
 @Socket('match-room-joined')
  onMatchRoomJoined(currentMatch: any) {
    console.log('currentMatch', currentMatch);
    this.currentMatch = currentMatch;
  }

  @Socket('starting-match')
  onMatchStarted() {
    console.log('<===== Match Started =====>');
  }
  /** Sockets */

  /** Computed */

  get user() {
    return this.$store.getters.user;
  }
 
  /** Mathods */

  private initiateGame(fixture: string) {
    this.$axios
      .post(`/game/new-game`, { fixture })
      .then(response => {
        // Check for errors here o
        console.log(response.data);

        this.fixture = response.data.fixture;

        // now emit join match event...
        this.$socket.client.emit('join-match', {user: this.user.userID, match: this.fixture._id});
      })
      .catch(response => {
        console.log('Error initiating game => ', response);
      });
  }

  mounted() {
    // get match and send request...
    const fixtureId = this.$route.params.fixture;

    this.fixtureId = fixtureId;

    this.initiateGame(fixtureId);
  }
}
</script>
