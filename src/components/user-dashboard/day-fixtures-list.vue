<template>
  <v-list>
      <v-list-item-group
        v-model="selectedMatch"
        mandatory
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
            <v-list-item-title>
            {{ match.Fixture.Title }}
            </v-list-item-title>

          <v-list-item-subtitle v-text="match.Fixture.Competition"></v-list-item-subtitle>
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

  private selectedMatch: any = {};
}
</script>

<style scoped></style>
