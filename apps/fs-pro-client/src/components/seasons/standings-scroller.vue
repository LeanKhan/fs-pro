<template>
  <v-card flat>
    <v-card-subtitle>
      <v-spacer></v-spacer>
      <v-switch
        :model-value="showWeekly"
        @update:model-value="showWeekly = $event"
        dense
        hide-details
        label="Show Weekly Standings?"
      ></v-switch>
    </v-card-subtitle>
    <v-window
      v-if="showWeekly"
      :model-value="onboarding"
      @update:model-value="onboarding = $event"
      reverse
    >
      <v-window-item v-for="(standing, i) in standings" :key="`standing-${i}`">
        <standings :WeekStandings="standing" :compiled="showWeekly"></standings>
      </v-window-item>
    </v-window>

    <standings
      v-else
      :WeekStandings="compiledStandings"
      :compiled="showWeekly"
    ></standings>

    <v-card-actions v-if="showWeekly" class="justify-space-between">
      <v-btn text @click="prev">
        <v-icon>mdi-chevron-left</v-icon>
      </v-btn>
      <v-item-group
        :model-value="onboarding"
        @update:model-value="onboarding = $event"
        class="text-center"
        mandatory
      >
        <v-item
          v-for="n in length"
          :key="`btn-${n}`"
          v-slot:default="{ active, toggle }"
        >
          <!-- <v-avatar>
            {{ onboarding }}
        </v-avatar> -->
          <v-btn :input-value="active" icon @click="toggle">
            {{ n }}
          </v-btn>
        </v-item>
      </v-item-group>
      <v-btn text @click="next">
        <v-icon>mdi-chevron-right</v-icon>
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import Standings from '@/components/seasons/standings.vue';
import { WeekStandings } from '@/interfaces/season';

interface Props {
  standings: WeekStandings[];
}

const props = defineProps<Props>();

const onboarding = ref(0);
const showWeekly = ref(false);

const next = (): void => {
  onboarding.value =
    onboarding.value + 1 === length.value ? 0 : onboarding.value + 1;
};

const prev = (): void => {
  onboarding.value =
    onboarding.value - 1 < 0 ? length.value - 1 : onboarding.value - 1;
};

const length = computed(() => {
  return props.standings.length;
});

const total = computed(() => {
  return props.standings.reduce(
    (acc: any, week: WeekStandings) => acc.concat(week.Table),
    []
  );
});

const compiledStandings = computed(() => {
  const sum: any[] = [];

  Array.from(new Set(total.value.map((x: any) => x.ClubCode))).forEach((x) => {
    sum.push(
      total.value
        .filter((y: any) => y.ClubCode === x)
        .reduce((output: any, item: any) => {
          const pnts = output['Points'] === undefined ? 0 : output['Points'];
          const gd = output['GD'] === undefined ? 0 : output['GD'];
          const ga = output['GA'] === undefined ? 0 : output['GA'];
          const gf = output['GF'] === undefined ? 0 : output['GF'];
          const plyd = output['Played'] === undefined ? 0 : output['Played'];
          const w = output['Wins'] === undefined ? 0 : output['Wins'];
          const l = output['Losses'] === undefined ? 0 : output['Losses'];
          const d = output['Draws'] === undefined ? 0 : output['Draws'];

          output['ClubCode'] = x;
          output['Points'] = item.Points + pnts;
          output['GD'] = item.GD + gd;
          output['GA'] = item.GA + ga;
          output['GF'] = item.GF + gf;
          output['Played'] = item.Played + plyd;
          output['Wins'] = item.Wins + w;
          output['Losses'] = item.Losses + l;
          output['Draws'] = item.Draws + d;

          return output;
        }, {})
    );
  });
  return sum;
});
</script>
