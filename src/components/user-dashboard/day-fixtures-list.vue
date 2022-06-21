<template>
  <v-list>
      <v-list-item-group
        v-model="selectedMatch"
        :mandatory="MandatorySelect"
        two-line
        @change="$emit('match-selected', Matches[selectedMatch])"
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

<script lang="ts">
import { ICalendarMatch } from '@/interfaces/calendar';
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class DayFixturesList extends Vue {
  @Prop({ required: true }) readonly Matches!: ICalendarMatch[];
  @Prop({ required: false }) readonly Detail: 'details' | 'results';
  @Prop({ required: false, default: true }) readonly MandatorySelect;

  private selectedMatch: any = null;
}
</script>

<style scoped></style>
