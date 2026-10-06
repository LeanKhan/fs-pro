<template>
  <v-list lines="two">
    <v-list-item
      v-for="(match, i) in Matches"
      :key="i"
      :value="i"
      :active="selectedMatch === i"
      @click="onSelectedMatchChange(i)"
      color="primary"
    >
      <template v-slot:prepend>
        <div class="d-flex align-center">
          <router-link
            v-if="match.HomeTeamId"
            :to="`/u/clubs/${match.HomeTeamId}/${match.Home}`"
            @click.stop
            title="View Home Club Public Profile"
            class="text-decoration-none"
          >
            <v-icon>custom:{{ match.Home }}</v-icon>
          </router-link>
          <v-icon v-else>custom:{{ match.Home }}</v-icon>
          <span class="mx-1 text-caption text-medium-emphasis">vs</span>
          <router-link
            v-if="match.AwayTeamId"
            :to="`/u/clubs/${match.AwayTeamId}/${match.Away}`"
            @click.stop
            title="View Away Club Public Profile"
            class="text-decoration-none"
          >
            <v-icon>custom:{{ match.Away }}</v-icon>
          </router-link>
          <v-icon v-else>custom:{{ match.Away }}</v-icon>
        </div>
      </template>

      <div v-if="Detail == 'details'" class="ml-2">
        <v-list-item-title class="text-body-2 font-weight-medium">
          {{ match.Title }}
        </v-list-item-title>

        <v-list-item-subtitle class="text-caption">
          {{ fixtureStageLabel(match) }}
          <span v-if="isForfeit(match)" class="font-weight-bold text-red-lighten-2 ml-2">Forfeit</span>
          <span v-else-if="match.Played && match.Details" class="font-weight-bold text-amber ml-2">
            ({{ match.Details.HomeTeamScore }} - {{ match.Details.AwayTeamScore }})
          </span>
        </v-list-item-subtitle>
      </div>

      <div v-if="Detail == 'results' && isForfeit(match)" class="text-body-2 font-weight-bold text-red-lighten-2 ml-2">Forfeit</div>
      <div v-else-if="Detail == 'results' && match.Details" class="text-body-2 font-weight-bold text-amber ml-2">
        {{ match.Details.HomeTeamScore }} : {{ match.Details.AwayTeamScore }}
      </div>

      <template v-slot:append>
        <v-btn
          v-if="match.Played"
          size="x-small"
          variant="tonal"
          color="info"
          icon="mdi-play"
          title="Watch match replay"
          :to="'/matchzone/' + match._id?.toString()"
          @click.stop
        ></v-btn>
        <v-chip v-else size="x-small" color="grey" variant="tonal">
          Upcoming
        </v-chip>
      </template>
    </v-list-item>
  </v-list>
</template>

<script setup lang="ts">
import { fixtureStageLabel, isForfeit } from '@/helpers/open-play';
import { ref } from 'vue';
import type { Fixture } from '@repo/api-contract';

interface Props {
  Matches: Fixture[];
  Detail?: 'details' | 'results';
  MandatorySelect?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  MandatorySelect: true,
});

const emit = defineEmits<{
  'match-selected': [match: Fixture];
}>();

const selectedMatch = ref<any>(null);

const onSelectedMatchChange = (value: any): void => {
  selectedMatch.value = value;
  if (value !== null && props.Matches[value]) {
    emit('match-selected', props.Matches[value]);
  }
};
</script>

<style scoped></style>
