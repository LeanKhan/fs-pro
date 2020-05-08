<template>
  <div>
    User dashboard works!

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
