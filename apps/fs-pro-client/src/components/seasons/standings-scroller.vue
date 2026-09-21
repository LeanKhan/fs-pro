<template>
  <v-card flat>
    <v-card-subtitle class="d-flex align-center">
      <v-chip size="small" variant="tonal" :color="weeksRemaining === 0 ? 'success' : 'primary'">
        {{
          totalWeeks === 0
            ? 'No weeks scheduled'
            : weeksRemaining === 0
              ? 'Season complete'
              : `${weeksRemaining} week${weeksRemaining === 1 ? '' : 's'} remaining`
        }}
        <span v-if="totalWeeks > 0" class="ml-1 text-medium-emphasis">
          ({{ weeksPlayed }}/{{ totalWeeks }})
        </span>
      </v-chip>
      <v-spacer></v-spacer>
      <v-switch
        :model-value="showWeekly"
        @update:model-value="showWeekly = $event"
        density="compact"
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
      :movement="movement"
    ></standings>

    <v-card-actions v-if="showWeekly" class="justify-space-between">
      <v-btn variant="text" @click="prev">
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
          v-slot="{ isSelected, toggle }"
        >
          <!-- <v-avatar>
            {{ onboarding }}
        </v-avatar> -->
          <v-btn :active="isSelected" icon @click="toggle">
            {{ n }}
          </v-btn>
        </v-item>
      </v-item-group>
      <v-btn variant="text" @click="next">
        <v-icon>mdi-chevron-right</v-icon>
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import Standings from '@/components/seasons/standings-component.vue';
import type { WeekStandings } from '@repo/api-contract';

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

const aggregate = (weeks: WeekStandings[]): any[] => {
  const all = weeks.reduce(
    (acc: any[], week: WeekStandings) => acc.concat(week.Table),
    []
  );
  const sum: any[] = [];

  Array.from(new Set(all.map((x: any) => x.ClubCode))).forEach((x) => {
    sum.push(
      all
        .filter((y: any) => y.ClubCode === x)
        .reduce((output: any, item: any) => {
          output['ClubCode'] = x;
          output['ClubID'] = item.ClubID ?? output['ClubID'];
          output['Points'] = item.Points + (output['Points'] ?? 0);
          output['GD'] = item.GD + (output['GD'] ?? 0);
          output['GA'] = item.GA + (output['GA'] ?? 0);
          output['GF'] = item.GF + (output['GF'] ?? 0);
          output['Played'] = item.Played + (output['Played'] ?? 0);
          output['Wins'] = item.Wins + (output['Wins'] ?? 0);
          output['Losses'] = item.Losses + (output['Losses'] ?? 0);
          output['Draws'] = item.Draws + (output['Draws'] ?? 0);

          return output;
        }, {})
    );
  });
  return sum;
};

const compiledStandings = computed(() => aggregate(props.standings));

// The season's empty weekly tables are created up front, so the array length
// is the season length; a week counts as played once anyone has a game in it.
const totalWeeks = computed(() => props.standings.length);
const weeksPlayed = computed(
  () =>
    props.standings.filter((w) => w.Table.some((r: any) => r.Played > 0)).length
);
const weeksRemaining = computed(() =>
  Math.max(totalWeeks.value - weeksPlayed.value, 0)
);

const rankOf = (rows: any[]): Map<string, number> =>
  new Map(
    [...rows]
      .sort(
        (a, b) => b.Points - a.Points || b.GD - a.GD || b.GF - a.GF
      )
      .map((r, i) => [r.ClubCode, i + 1] as [string, number])
  );

// Positions gained (+) / lost (-) since the previous played week; empty
// until two weeks have been played.
const movement = computed<Record<string, number>>(() => {
  if (weeksPlayed.value < 2) return {};
  const played = props.standings.filter((w) =>
    w.Table.some((r: any) => r.Played > 0)
  );
  const now = rankOf(aggregate(played));
  const before = rankOf(aggregate(played.slice(0, -1)));
  const out: Record<string, number> = {};
  now.forEach((rank, code) => {
    out[code] = (before.get(code) ?? rank) - rank;
  });
  return out;
});
</script>
