<template>
  <v-card height="300px">
    <v-card-subtitle>
      {{ Match.Fixture.LeagueCode }}
      <v-icon small color="amber lighten-3">
        mdi-trophy
      </v-icon>
    </v-card-subtitle>
    <p class="mb-0 mt-0 caption">
      Week
      {{ Match.Week }}
    </p>

    <v-card-text>
      <v-avatar>
        <v-icon>${{ Match.Fixture.Home }}</v-icon>
      </v-avatar>
      vs
      <v-avatar>
        <v-icon>${{ Match.Fixture.Away }}</v-icon>
      </v-avatar>

      <div class="pa-0 text-center">
        <p class="mb-2 caption white--text">
          {{ Match.Fixture.Title }}
        </p>

        <p class="mb-0 caption">
          {{ Match.Fixture.Stadium }}
        </p>
      </div>
    </v-card-text>

    <v-card-actions>
      <v-btn
        depressed
        color="success"
        block
        :disabled="Match.Fixture.Played"
        :to="'/matchzone/' + Match.Fixture._id.toString()"
      >
        Play
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script lang="ts">
import { ICalendarMatch } from '@/interfaces/calendar';
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class FixtureCard extends Vue {
  @Prop({ required: true }) readonly Match!: ICalendarMatch;
}
</script>

<style scoped></style>
