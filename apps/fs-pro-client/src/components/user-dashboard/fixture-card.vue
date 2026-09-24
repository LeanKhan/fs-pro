<template>
  <v-card height="300px">
    <v-card-subtitle>
      <v-chip size="x-small" color="amber" variant="tonal" prepend-icon="mdi-trophy">{{ fixtureStageLabel(Match) }}</v-chip>
    </v-card-subtitle>
    <p class="mb-0 mt-0 text-caption">
      <template v-if="Match.ScheduledDay != null">Day {{ Match.ScheduledDay }}</template>
      <template v-if="!Match.Played && Match.PlayBy != null"> · play by day {{ Match.PlayBy }}</template>
    </p>

    <v-card-text class="text-center">
      <div class="d-flex justify-center align-center gap-2 mb-2">
        <router-link
          v-if="Match.HomeTeamId"
          :to="`/u/clubs/${Match.HomeTeamId}/${Match.Home}`"
          title="View Home Club Public Profile"
          class="text-decoration-none"
        >
          <v-avatar size="44" class="elevation-1">
            <v-icon size="36">custom:{{ Match.Home }}</v-icon>
          </v-avatar>
        </router-link>
        <v-avatar v-else size="44">
          <v-icon size="36">custom:{{ Match.Home }}</v-icon>
        </v-avatar>

        <div v-if="isForfeit(Match)" class="mx-3">
          <div class="text-h6 font-weight-bold text-red-lighten-2">Forfeit</div>
          <v-chip size="x-small" color="red">3 - 0</v-chip>
        </div>
        <div v-else-if="Match.Played && Match.Details" class="mx-3">
          <div class="text-h5 font-weight-bold text-amber-lighten-2">
            {{ Match.Details.HomeTeamScore }} : {{ Match.Details.AwayTeamScore }}
          </div>
          <v-chip size="x-small" color="success">Full Time</v-chip>
        </div>
        <div v-else class="mx-3 font-weight-bold text-subtitle-1">
          VS
        </div>

        <router-link
          v-if="Match.AwayTeamId"
          :to="`/u/clubs/${Match.AwayTeamId}/${Match.Away}`"
          title="View Away Club Public Profile"
          class="text-decoration-none"
        >
          <v-avatar size="44" class="elevation-1">
            <v-icon size="36">custom:{{ Match.Away }}</v-icon>
          </v-avatar>
        </router-link>
        <v-avatar v-else size="44">
          <v-icon size="36">custom:{{ Match.Away }}</v-icon>
        </v-avatar>
      </div>

      <div class="pa-0 text-center">
        <p class="mb-1 text-subtitle-2 font-weight-bold text-white">
          {{ Match.Title }}
        </p>

        <p class="mb-0 text-caption text-medium-emphasis">
          <WorldLink :entity-id="(Match as any).entity_id" :fallback="Match.Stadium || 'Stadium'" />
        </p>
      </div>
    </v-card-text>

    <v-card-actions>
      <v-btn
        v-if="Match.Played"
        variant="flat"
        color="info"
        block
        prepend-icon="mdi-play-circle"
        :to="'/matchzone/' + Match._id?.toString()"
      >
        Watch Replay
      </v-btn>
      <v-btn
        v-else
        variant="flat"
        color="success"
        block
        prepend-icon="mdi-soccer"
        :to="'/matchzone/' + Match._id?.toString()"
      >
        Play Match
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import type { Fixture } from '@repo/api-contract';
import WorldLink from '@/components/world/WorldLink.vue';
import { fixtureStageLabel, isForfeit } from '@/helpers/open-play';

interface Props {
  Match: Fixture;
}

defineProps<Props>();
</script>

<style scoped></style>
