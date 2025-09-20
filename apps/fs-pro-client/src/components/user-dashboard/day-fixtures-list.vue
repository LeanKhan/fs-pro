<template>
  <v-list>
      <v-list-item-group
        :model-value="selectedMatch"
        @update:model-value="onSelectedMatchChange"
        :mandatory="MandatorySelect"
        two-line
        color="primary"
      >
        <v-list-item
          v-for="(match, i) in Matches"
          :key="i"
          :title="match.Fixture.Title + ' -> ' + match.Competition"
        >
          <v-list-item-icon>
             <v-icon>${{ match.Fixture.Home }}</v-icon> vs
             <v-icon>${{ match.Fixture.Away }}</v-icon>
          </v-list-item-icon>

          <v-list-item-content>
            <div v-if="Detail == 'details'">
              <v-list-item-title>
                {{ match.Fixture.Title }}
              </v-list-item-title>

              <v-list-item-subtitle v-text="match.Fixture.Competition"></v-list-item-subtitle>
            </div>

            <div v-if="Detail == 'results' && match.Fixture.Details">
              {{ match.Fixture.Details.HomeTeamScore }} : {{ match.Fixture.Details.AwayTeamScore }}
            </div>
          </v-list-item-content>
        </v-list-item>
      </v-list-item-group>
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
