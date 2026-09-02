<template>
  <v-card height="300px">
    <v-card-subtitle>
      {{ Match.LeagueCode }}
      <v-icon size="small" color="amber-lighten-3">mdi-trophy</v-icon>
    </v-card-subtitle>
    <p class="mb-0 mt-0 text-caption">
      Week
      {{ Match.Week }}
    </p>

    <v-card-text>
      <v-avatar>
        <v-icon>custom:{{ Match.Home }}</v-icon>
      </v-avatar>
      vs
      <v-avatar>
        <v-icon>custom:{{ Match.Away }}</v-icon>
      </v-avatar>

      <div class="pa-0 text-center">
        <p class="mb-2 text-caption text-white">
          {{ Match.Title }}
        </p>

        <p class="mb-0 text-caption">
          {{ Match.Stadium }}
        </p>
      </div>
    </v-card-text>

    <v-card-actions>
      <v-btn
        variant="flat"
        color="success"
        block
        :disabled="Match.Played"
        :to="'/matchzone/' + Match._id.toString()"
      >
        Play
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { IFixture } from '@/interfaces/fixture';

interface Props {
  Match: IFixture;
}

defineProps<Props>();
</script>

<style scoped></style>
