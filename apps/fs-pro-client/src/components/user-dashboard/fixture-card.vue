<template>
  <v-card height="300px">
    <v-card-subtitle>
      {{ Match.Fixture.LeagueCode }}
      <v-icon size="small" color="amber-lighten-3">mdi-trophy</v-icon>
    </v-card-subtitle>
    <p class="mb-0 mt-0 text-caption">
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
        <p class="mb-2 text-caption text-white">
          {{ Match.Fixture.Title }}
        </p>

        <p class="mb-0 text-caption">
          {{ Match.Fixture.Stadium }}
        </p>
      </div>
    </v-card-text>

    <v-card-actions>
      <v-btn
        variant="flat"
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

<script setup lang="ts">
import { ICalendarMatch } from '@/interfaces/calendar';

interface Props {
  Match: ICalendarMatch;
}

defineProps<Props>();
</script>

<style scoped></style>
