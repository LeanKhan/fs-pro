<template>
  <v-container fluid>
    <div class="d-flex align-center mb-4 ga-2">
      <div>
        <div class="text-h5 font-weight-bold">Competitions</div>
        <div class="text-caption text-medium-emphasis">Build competitions any time. Each run is an edition.</div>
      </div>
      <v-spacer />
      <v-switch v-model="showArchived" label="Show archived" density="compact" hide-details color="grey" class="mr-2" />
      <v-btn color="teal" variant="flat" prepend-icon="mdi-plus" to="/a/competitions/new">New competition</v-btn>
    </div>
    <v-alert v-if="error" type="error" density="compact" class="mb-3">{{ error }}</v-alert>
    <v-progress-linear v-if="loading" indeterminate color="teal" class="mb-2" />
    <v-row>
      <v-col v-for="c in competitions" :key="c.id" cols="12" md="6" lg="4">
        <v-card :class="{ 'opacity-60': c.archived }">
          <v-card-item>
            <v-card-title class="d-flex align-center ga-2">
              {{ c.name }}
              <v-chip size="x-small">{{ c.code }}</v-chip>
              <v-chip v-if="c.archived" size="x-small" color="grey">archived</v-chip>
            </v-card-title>
            <v-card-subtitle>{{ c.type }} · {{ '★'.repeat(c.prestige) }}</v-card-subtitle>
          </v-card-item>
          <v-card-text>
            <div class="text-body-2 mb-2">{{ formatSummary(c.definition as never) }}</div>
            <stage-timeline :definition="c.definition" />
            <div v-if="c.latestEdition" class="mt-2 text-caption">
              Latest: {{ c.latestEdition.code }}
              <v-chip size="x-small" :color="STATUS_COLORS[c.latestEdition.status]">{{ c.latestEdition.status }}</v-chip>
            </div>
          </v-card-text>
          <v-card-actions>
            <v-btn variant="text" :to="`/a/competitions/${c.id}/${c.code}`">Open</v-btn>
            <v-btn variant="text" :to="`/a/competitions/${c.id}/${c.code}/update`">Edit</v-btn>
            <v-spacer />
            <v-btn variant="text" size="small" color="grey" @click="archive(c)">{{ c.archived ? 'Restore' : 'Archive' }}</v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
      <v-col v-if="!competitions.length && !loading" cols="12" class="text-center text-medium-emphasis py-8">
        No competitions yet. Start with a preset.
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type { CompetitionSummary } from '@repo/api-contract';
import StageTimeline from '@/components/open-play/stage-timeline.vue';
import { client } from '@/services/api';
import { unwrap } from '@/store/open-play';
import { STATUS_COLORS, formatSummary } from '@/helpers/open-play';

const competitions = ref<CompetitionSummary[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const showArchived = ref(false);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    competitions.value = unwrap<CompetitionSummary[]>(
      await client.competitionDefinitions.list.query({ query: { includeArchived: showArchived.value || undefined } })
    );
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}
async function archive(c: CompetitionSummary) {
  try {
    unwrap(await client.competitionDefinitions.archive.mutation({ params: { id: c.id }, body: { archived: !c.archived } }));
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}
watch(showArchived, load);
onMounted(load);
</script>
