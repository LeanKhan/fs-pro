<template>
  <v-card variant="outlined" class="pa-3 stage-editor">
    <div class="d-flex align-center mb-3 ga-2">
      <v-chip color="indigo" size="small">Stage {{ index + 1 }}</v-chip>
      <v-btn-toggle :model-value="stage.type" density="compact" variant="outlined" divided mandatory @update:model-value="changeType">
        <v-btn value="league" size="small" prepend-icon="mdi-format-list-numbered">League</v-btn>
        <v-btn value="groups" size="small" prepend-icon="mdi-view-grid">Groups</v-btn>
        <v-btn value="knockout" size="small" prepend-icon="mdi-tournament">Knockout</v-btn>
      </v-btn-toggle>
      <v-spacer />
      <v-btn icon="mdi-arrow-up" size="x-small" variant="text" :disabled="index === 0" @click="emit('move', -1)" />
      <v-btn icon="mdi-arrow-down" size="x-small" variant="text" :disabled="last" @click="emit('move', 1)" />
      <v-btn icon="mdi-delete" size="x-small" variant="text" color="red-lighten-2" :disabled="only" @click="emit('remove')" />
    </div>

    <template v-if="stage.type === 'knockout'">
      <v-row dense>
        <v-col cols="6" md="3">
          <v-select v-model="stage.legs" :items="[1, 2]" label="Legs" density="compact" variant="outlined" />
        </v-col>
        <v-col cols="6" md="3">
          <v-text-field v-model.number="stage.tieDays" type="number" label="Days per round" density="compact" variant="outlined" />
        </v-col>
        <v-col cols="6" md="3">
          <v-select
            v-model="stage.seeding"
            :items="[
              { title: 'By Elo', value: 'elo' },
              { title: 'Random', value: 'random' },
              { title: 'Previous stage', value: 'previous-stage' },
            ]"
            label="Seeding"
            density="compact"
            variant="outlined"
          />
        </v-col>
        <v-col cols="6" md="3">
          <v-select
            v-model="stage.drawAtEnd"
            :items="[
              { title: 'Penalties', value: 'penalties' },
              { title: 'Higher seed', value: 'higher-seed' },
              { title: 'Away goals', value: 'away-goals' },
            ]"
            label="Level at the end"
            density="compact"
            variant="outlined"
          />
        </v-col>
      </v-row>
    </template>

    <template v-else>
      <v-row dense>
        <v-col cols="6" md="3">
          <v-text-field v-model.number="stage.days" type="number" label="Days" density="compact" variant="outlined" />
        </v-col>
        <v-col v-if="stage.type === 'groups'" cols="6" md="3">
          <v-text-field v-model.number="stage.groupSize" type="number" label="Group size" density="compact" variant="outlined" />
        </v-col>
        <v-col cols="6" md="3">
          <v-select v-model="rules.metric" :items="metricItems" label="Ranked by" density="compact" variant="outlined" clearable />
        </v-col>
        <v-col cols="6" md="3">
          <v-text-field v-model.number="rules.minGamesToRank" type="number" label="Games to be ranked" density="compact" variant="outlined" clearable />
        </v-col>
        <v-col cols="6" md="3">
          <v-text-field v-model.number="rules.maxVsSameOpponent" type="number" label="Max vs same club" density="compact" variant="outlined" clearable />
        </v-col>
        <v-col cols="6" md="3">
          <v-text-field v-model.number="rules.challengeRange" type="number" label="Challenge range (ranks, 0 = any)" density="compact" variant="outlined" clearable />
        </v-col>
        <v-col cols="6" md="3">
          <v-text-field v-model.number="rules.respondWithinDays" type="number" label="Days to answer" density="compact" variant="outlined" clearable />
        </v-col>
        <v-col cols="6" md="3">
          <v-text-field v-model.number="rules.maxGames" type="number" label="Max games" density="compact" variant="outlined" clearable />
        </v-col>
      </v-row>
      <div class="d-flex align-center ga-2 flex-wrap">
        <v-switch
          :model-value="!!stage.advance"
          label="Clubs advance to the next stage"
          color="teal"
          density="compact"
          hide-details
          :disabled="stage.type === 'groups'"
          @update:model-value="toggleAdvance"
        />
        <template v-if="stage.advance">
          <v-text-field v-model.number="stage.advance.top" type="number" label="Top N advance" density="compact" variant="outlined" hide-details style="max-width: 150px" />
          <v-switch v-if="stage.type === 'groups'" v-model="stage.advance.perGroup" label="per group" density="compact" hide-details color="teal" />
          <v-text-field v-model.number="stage.advance.bestRunnersUp" type="number" label="+ best runners-up" density="compact" variant="outlined" hide-details style="max-width: 170px" />
        </template>
      </div>
    </template>
  </v-card>
</template>

<script setup lang="ts">
import { computed, watchEffect } from 'vue';
import { METRIC_LABELS } from '@/helpers/open-play';

/** One stage of a competition. Rules left blank use the world defaults. */
export type EditableStage = {
  type: 'league' | 'groups' | 'knockout';
  days?: number;
  groupSize?: number;
  rules?: Record<string, number | string | null | undefined>;
  advance?: { top: number; perGroup?: boolean; bestRunnersUp?: number };
  legs?: 1 | 2;
  tieDays?: number;
  seeding?: 'elo' | 'random' | 'previous-stage';
  drawAtEnd?: 'penalties' | 'higher-seed' | 'away-goals';
};

const props = defineProps<{ stage: EditableStage; index: number; last: boolean; only: boolean }>();
const emit = defineEmits<{ (e: 'move', dir: number): void; (e: 'remove'): void }>();

const metricItems = Object.entries(METRIC_LABELS).map(([value, title]) => ({ value, title }));
// League and group stages always carry a rules object for the fields to bind to.
watchEffect(() => {
  if (props.stage.type !== 'knockout' && !props.stage.rules) props.stage.rules = {};
});
const rules = computed(() => props.stage.rules ?? {});

function changeType(type: EditableStage['type']) {
  const s = props.stage;
  for (const k of Object.keys(s)) delete (s as Record<string, unknown>)[k];
  s.type = type;
  if (type === 'knockout') Object.assign(s, { legs: 1, tieDays: 4, seeding: 'elo', drawAtEnd: 'penalties' });
  else if (type === 'groups') Object.assign(s, { days: 21, groupSize: 4, rules: {}, advance: { top: 2, perGroup: true } });
  else Object.assign(s, { days: 30, rules: {} });
}
function toggleAdvance(on: boolean | null) {
  props.stage.advance = on ? { top: 4 } : undefined;
}
</script>
