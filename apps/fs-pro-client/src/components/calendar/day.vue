<template>
  <v-card
    class="mx-2 pa-1"
    :input-value="active"
    active-class="indigo white--text"
    depressed
    rounded
    height="180px"
    width="200px"
    :color="active ? 'indigo' : 'indigo lighten-2'"
    @click="() => toggle()"
  >
    <v-card-text class="pa-0">
      <span v-if="$route.name == 'Club Home'">Your match? {{ isClub }}</span>
      <v-row no-gutters>
        <template v-if="!day.isFree">
          <template v-if="!singleLeague">
            <v-col cols="12">
              <day-match v-if="leagueMatch" :match="leagueMatch" :home="true"></day-match>
              <v-btn dark icon>
                <v-icon>mdi-caret-down</v-icon>
              </v-btn>
            </v-col>
          </template>

          <!-- If not in singleLeague -->
          <template v-else>
            <div v-if="isClub">
              <v-icon large>
                ${{ day.Matches[0] ? day.Matches[0].Fixture.Home : 'NA' }}
              </v-icon>

              <span>vs</span>

              <v-icon large>
                ${{ day.Matches[0] ? day.Matches[0].Fixture.Away : 'NA' }}
              </v-icon>
            </div>

            <div v-else>
              Not your match!
            </div>
          </template>
        </template>

        <!-- No match :p -->
        <template v-else>
          <p>no match!</p>
        </template>
      </v-row>
    </v-card-text>

    <v-divider></v-divider>
    <v-card-actions class="text-center">
      <v-chip small :color="active ? 'indigo darken-2' : 'indigo'">
        Day {{ day.Day }}
      </v-chip>
      <v-spacer></v-spacer>

      <v-dialog v-model="dialog" scrollable max-width="400px">
        <template v-slot:activator="{ isActive, props }">
          <v-btn dark icon v-bind="props" v-on="isActive">
            <v-icon>mdi-dots-vertical</v-icon>
          </v-btn>
        </template>
        <v-card>
          <v-card-title>Other Matches Today</v-card-title>
          <v-divider></v-divider>
          <v-card-text style="height: 300px;">
            <v-list dense>
              <v-list-item v-for="(m, i) in day.Matches" :key="i">
                <v-list-item-content>
                  <v-list-item-title>
                    {{ m.Fixture.Title }}
                  </v-list-item-title>
                </v-list-item-content>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
      </v-dialog>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useStore } from '@/store';
import DayMatch from './day-match.vue';

interface Props {
  day: any;
  toggle: () => void;
  active: boolean;
  singleLeague: boolean;
  club?: string;
}

const props = defineProps<Props>();
const store = useStore();

const dialog = ref(false);

const $selectedLeague = computed(() => {
  return store.selectedLeague;
});

const leagueMatch = computed(() => {
  if ($selectedLeague.value) {
    return props.day.Matches.find(
      (m: any) => m.CompetitionId === $selectedLeague.value
    );
  }
  return null;
});

const isClub = computed(() => {
  if (props.club) {
    return (
      leagueMatch.value?.Fixture.Home === props.club ||
      leagueMatch.value?.Fixture.Away === props.club
    );
  }
  return false;
});
</script>

<style></style>
