<template>
  <div>
    <v-toolbar>
      <v-toolbar-title>
        {{ match ? match.home : 'NA' }} vs {{ match ? match.away : ' NA' }}
      </v-toolbar-title>

      <v-spacer></v-spacer>

      <v-chip>
        {{ match.details ? match.details.FullTimeScore : 'Not Played yet' }}
      </v-chip>
    </v-toolbar>

    <v-list v-if="events.length > 0">
      <v-list-item v-for="(event, i) in events" :key="i">
        <v-list-item-avatar>
          {{ event.type }}
        </v-list-item-avatar>

        <v-list-item-content>
          <v-list-item-title>
            {{ event.message }}
          </v-list-item-title>
        </v-list-item-content>

        <v-list-item-avatar>
          {{ event.time }}
        </v-list-item-avatar>
      </v-list-item>
    </v-list>

    <!-- Main -->

    <v-row style="height: 300px">
      <v-col cols="8">
        <v-card>
          <v-sheet height="100%" width="100%" color="pink darken-2">
            <div class="text-center">
              yeet
            </div>
          </v-sheet>
        </v-card>
      </v-col>
      <v-col cols="4">
        <v-card>
          <v-sheet height="100%" width="100%" color="green darken-2">
            <div class="text-center">
              yoot
            </div>
          </v-sheet>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Socket } from 'vue-socket.io-extended';

@Component
export default class UserDashboard extends Vue {
  @Socket('match-event')
  onMatchEvent(event: any) {
    this.events.push(event);
  }

  @Socket('match-started')
  onMatchStarted() {
    console.log('<===== Match Started =====>');
  }

  @Socket('match-ended')
  onMatchEnded(match: any) {
    this.match = match;
  }

  private events: any[] = [];

  private match: any = {};
}
</script>

<style></style>
