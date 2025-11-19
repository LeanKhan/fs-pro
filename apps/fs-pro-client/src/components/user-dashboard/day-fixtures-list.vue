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
          <v-icon>${{ match.Fixture.Home }}</v-icon>
          <span class="mx-1">vs</span>
          <v-icon>${{ match.Fixture.Away }}</v-icon>
        </div>
      </template>

      <div v-if="Detail == 'details'">
        <v-list-item-title>
          {{ match.Fixture.Title }}
        </v-list-item-title>

        <v-list-item-subtitle>
          {{ match.Competition }}
        </v-list-item-subtitle>
      </div>

      <div v-if="Detail == 'results' && match.Fixture.Details">
        {{ match.Fixture.Details.HomeTeamScore }} :
        {{ match.Fixture.Details.AwayTeamScore }}
      </div>
    </v-list-item>
  </v-list>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ICalendarMatch } from '@/interfaces/calendar';

interface Props {
  Matches: ICalendarMatch[];
  Detail?: 'details' | 'results';
  MandatorySelect?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  MandatorySelect: true,
});

const emit = defineEmits<{
  'match-selected': [match: ICalendarMatch];
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
