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

      <template v-if="connected">
        <v-chip>Match Room Connected!</v-chip>
      </template>

       <template v-if="!allConnected">
        <v-chip>Waiting For Second user</v-chip>
      </template>

    </v-app-bar>

    <v-container>
      <v-row>
        <v-col cols="2">
          Match details
        </v-col>
        <v-col cols="10">
          <v-card>
            <span v-if="allConnected">
              READY
            </span>

            <span v-else>
              Not ready to play yet :(
            </span>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
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

  private connected = false;

  private secondUserConnected = false;

    /** Sockets */
 @Socket('match-room-joined')
  onMatchRoomJoined(currentMatch: any) {
    console.log('currentMatch', currentMatch);
    this.connected = true;
    this.currentMatch = currentMatch;
  }

  @Socket('starting-match')
  onMatchStarted() {
    console.log('<===== Match Started =====>');
  }

   @Socket('user-connected')
  onUserConnected() {
    console.log('<===== User connected =====>');
    this.secondUserConnected = true;
  }
  /** Sockets */

  /** Computed */

  get user() {
    return this.$store.getters.user;
  }

   get allConnected() {
    if(this.currentMatch.users){
      // Check is everyone is not connected
      return this.currentMatch.users.every((u: any) => { return u.connected });
    }

    return false;
  }
 
  /** Mathods */

  private initiateGame(fixture: string) {
    this.$axios
      .post(`/game/new-game`, { fixture, user: this.user.userID })
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
