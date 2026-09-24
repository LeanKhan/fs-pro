<template>
  <v-container fluid>
    <v-alert v-if="error" type="error" density="compact" class="mb-3" closable @click:close="error = null">{{ error }}</v-alert>
    <template v-if="competition">
      <div class="d-flex align-center mb-2 ga-2 flex-wrap">
        <v-btn icon="mdi-arrow-left" variant="text" size="small" to="/a/competitions" />
        <div>
          <div class="text-h5 font-weight-bold">{{ competition.name }} <v-chip size="small">{{ competition.code }}</v-chip></div>
          <div class="text-caption text-medium-emphasis">{{ formatSummary(competition.definition as never) }}</div>
        </div>
        <v-spacer />
        <v-btn variant="tonal" :to="`/a/competitions/${competition.id}/${competition.code}/update`" prepend-icon="mdi-pencil">Edit</v-btn>
        <v-btn color="teal" variant="flat" prepend-icon="mdi-plus" @click="openNew">New edition</v-btn>
      </div>
      <stage-timeline :definition="competition.definition" class="mb-4" />

      <v-row>
        <v-col cols="12" md="4">
          <v-card>
            <v-card-title class="text-subtitle-1">Editions</v-card-title>
            <v-list density="compact">
              <v-list-item
                v-for="e in editions"
                :key="e.id"
                :active="selected?.id === e.id"
                :title="e.title"
                :subtitle="dates(e)"
                @click="select(e.id)"
              >
                <template #append>
                  <v-chip size="x-small" :color="STATUS_COLORS[e.status]">{{ e.status }}</v-chip>
                </template>
              </v-list-item>
              <div v-if="!editions.length" class="text-caption text-medium-emphasis pa-3">No editions yet</div>
            </v-list>
          </v-card>
        </v-col>
        <v-col cols="12" md="8">
          <v-card v-if="selected" class="pa-3">
            <div class="d-flex align-center ga-2 mb-2 flex-wrap">
              <div class="text-h6">{{ selected.title }}</div>
              <v-chip size="small" :color="STATUS_COLORS[selected.status]">{{ selected.status }}</v-chip>
              <v-spacer />
              <v-btn v-if="selected.status === 'draft'" color="teal" size="small" variant="flat" :loading="busy" @click="action('publish')">Publish</v-btn>
              <v-btn
                v-if="['draft', 'registration', 'running'].includes(selected.status)"
                color="red-lighten-2"
                size="small"
                variant="text"
                :loading="busy"
                @click="action('cancel')"
              >
                Cancel edition
              </v-btn>
            </div>
            <div class="text-caption text-medium-emphasis mb-3">
              Registration days {{ selected.registrationOpensDay ?? '—' }}–{{ selected.registrationClosesDay ?? '—' }} · starts day
              {{ selected.startDay ?? '—' }}<template v-if="selected.endDay != null"> · ends day {{ selected.endDay }}</template>
              <template v-if="selected.winnerId"> · winner {{ dir.name(selected.winnerId) }}</template>
            </div>
            <stage-timeline :definition="selected.definition ?? competition.definition" :current-stage="selected.currentStage" :status="selected.status" class="mb-3" />

            <div v-if="['draft', 'registration'].includes(selected.status)" class="d-flex ga-2 align-center mb-3">
              <v-autocomplete
                v-model="invitees"
                :items="clubItems"
                label="Invite clubs"
                multiple
                chips
                closable-chips
                density="compact"
                variant="outlined"
                hide-details
              />
              <v-btn :disabled="!invitees.length" :loading="busy" @click="invite">Invite</v-btn>
            </div>

            <edition-standings
              v-if="['running', 'finished'].includes(selected.status)"
              :edition-id="selected.id"
              :definition="selected.definition"
              :current-stage="selected.currentStage"
              :status="selected.status"
            />
            <v-table v-else density="compact">
              <thead><tr><th>Club</th><th>Status</th><th class="text-right">Fee paid</th><th /></tr></thead>
              <tbody>
                <tr v-for="en in selected.entries" :key="en.clubId">
                  <td>{{ en.clubName }}</td>
                  <td><v-chip size="x-small" :color="STATUS_COLORS[en.status]">{{ en.status }}</v-chip></td>
                  <td class="text-right">{{ money(en.feePaid) }}</td>
                  <td class="text-right">
                    <v-btn
                      v-if="['registered', 'invited'].includes(en.status)"
                      size="x-small"
                      variant="text"
                      color="red-lighten-2"
                      :loading="busy"
                      @click="removeEntry(en.clubId)"
                    >
                      Remove
                    </v-btn>
                  </td>
                </tr>
                <tr v-if="!selected.entries.length"><td colspan="4" class="text-center text-medium-emphasis">No entries</td></tr>
              </tbody>
            </v-table>
          </v-card>
          <v-card v-if="selected && challenges.length" class="pa-3 mt-4">
            <div class="text-subtitle-1 font-weight-bold mb-2">Challenges</div>
            <v-table density="compact">
              <thead>
                <tr><th>Match</th><th>Status</th><th class="text-right">Answer by</th><th class="text-right">Day</th><th /></tr>
              </thead>
              <tbody>
                <tr v-for="c in challenges" :key="c.id">
                  <td>{{ dir.name(c.homeClubId) }} vs {{ dir.name(c.awayClubId) }}</td>
                  <td><v-chip size="x-small" :color="STATUS_COLORS[c.played ? 'played' : (c.status ?? '')]">{{ c.played ? 'played' : c.status }}</v-chip></td>
                  <td class="text-right">{{ c.status === 'proposed' ? c.respondBy : '' }}</td>
                  <td class="text-right">{{ c.scheduledDay ?? '' }}</td>
                  <td class="text-right">
                    <v-btn
                      v-if="!c.played && ['proposed', 'accepted'].includes(c.status ?? '')"
                      size="x-small"
                      variant="text"
                      color="red-lighten-2"
                      :loading="busy"
                      @click="cancelChallenge(c)"
                    >
                      Cancel
                    </v-btn>
                  </td>
                </tr>
              </tbody>
            </v-table>
          </v-card>
          <div v-if="!selected" class="text-medium-emphasis text-center py-8">Pick an edition, or create one.</div>
        </v-col>
      </v-row>
    </template>

    <v-dialog v-model="newDialog" max-width="760">
      <v-card>
        <v-card-title>New edition</v-card-title>
        <v-card-text>
          <div class="text-caption text-medium-emphasis mb-3">Today is day {{ today }}. It starts as a draft; publish it to open registration on its day.</div>
          <v-text-field v-model.number="draft.registrationOpensDay" type="number" label="Registration opens (day)" density="compact" variant="outlined" />
          <v-text-field v-model.number="draft.registrationClosesDay" type="number" label="Registration closes (day)" density="compact" variant="outlined" />
          <v-text-field v-model.number="draft.startDay" type="number" label="Starts (day)" density="compact" variant="outlined" />
          <div class="text-caption text-medium-emphasis mb-1">Other editions around these days (registration light, play solid):</div>
          <edition-timeline
            :editions="allEditions"
            :today="today"
            :days="Math.max(45, draft.startDay - today + 30)"
            :draft="{ title: `${competition?.name ?? 'New'} (new)`, ...draft }"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="newDialog = false">Cancel</v-btn>
          <v-btn color="teal" variant="flat" :loading="busy" @click="createEdition">Create</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { CompetitionSummary, Edition, EditionDetail, EditionListItem, MatchChallenge, WorldSettings } from '@repo/api-contract';
import StageTimeline from '@/components/open-play/stage-timeline.vue';
import EditionStandings from '@/components/open-play/edition-standings.vue';
import EditionTimeline from '@/components/open-play/edition-timeline.vue';
import { client } from '@/services/api';
import { unwrap } from '@/store/open-play';
import { STATUS_COLORS, formatSummary, money, useClubDirectory } from '@/helpers/open-play';

const route = useRoute();
const dir = useClubDirectory();
const competition = ref<CompetitionSummary | null>(null);
const editions = ref<EditionListItem[]>([]);
const allEditions = ref<EditionListItem[]>([]);
const selected = ref<EditionDetail | null>(null);
const challenges = ref<MatchChallenge[]>([]);
const error = ref<string | null>(null);
const busy = ref(false);
const newDialog = ref(false);
const today = ref(0);
const draft = reactive({ registrationOpensDay: 0, registrationClosesDay: 0, startDay: 0 });
const invitees = ref<string[]>([]);
const clubItems = computed(() => [...dir.clubs.value.values()].map((c) => ({ title: `${c.Name} (${c.ClubCode})`, value: String(c._id) })));

const dates = (e: Edition) => (e.startDay != null ? `Day ${e.startDay}${e.endDay != null ? `–${e.endDay}` : ''}` : '');

async function run<T>(fn: () => Promise<T>) {
  busy.value = true;
  error.value = null;
  try {
    return await fn();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    return null;
  } finally {
    busy.value = false;
  }
}

async function load() {
  const id = String(route.params.id);
  await run(async () => {
    competition.value = unwrap<CompetitionSummary>(await client.competitionDefinitions.get.query({ params: { id } }));
    editions.value = unwrap<EditionListItem[]>(await client.editions.list.query({ query: { competitionId: id } }));
    const settings = unwrap<WorldSettings>(await client.world.getSettings.query());
    today.value = settings.currentDay;
    if (!selected.value && editions.value[0]) await select(editions.value[0].id);
    else if (selected.value) await select(selected.value.id);
  });
}
async function select(id: string) {
  selected.value = unwrap<EditionDetail>(await client.editions.get.query({ params: { id } }));
  try {
    challenges.value = unwrap<MatchChallenge[]>(await client.challenges.forEdition.query({ params: { editionId: id } }));
  } catch {
    challenges.value = [];
  }
}
async function removeEntry(clubId: string) {
  if (!selected.value) return;
  const id = selected.value.id;
  const ok = await run(async () => unwrap(await client.editions.withdraw.mutation({ params: { id, clubId }, body: {} })));
  if (ok) await select(id);
}
async function cancelChallenge(c: MatchChallenge) {
  if (!selected.value) return;
  const id = selected.value.id;
  const clubId = c.homeClubId ?? c.awayClubId ?? '';
  const ok = await run(async () =>
    unwrap(await client.challenges.respond.mutation({ params: { fixtureId: c.id, action: 'cancel' }, body: { clubId } }))
  );
  if (ok) await select(id);
}
async function openNew() {
  try {
    allEditions.value = unwrap<EditionListItem[]>(await client.editions.list.query({ query: {} }));
  } catch {
    allEditions.value = [];
  }
  Object.assign(draft, { registrationOpensDay: today.value + 1, registrationClosesDay: today.value + 7, startDay: today.value + 8 });
  newDialog.value = true;
}
async function createEdition() {
  const e = await run(async () =>
    unwrap<Edition>(await client.editions.create.mutation({ body: { competitionId: String(route.params.id), ...draft } }))
  );
  if (!e) return;
  newDialog.value = false;
  selected.value = null;
  await load();
  await select(e.id);
}
async function action(a: 'publish' | 'cancel') {
  if (!selected.value) return;
  const id = selected.value.id;
  const ok = await run(async () => unwrap(await client.editions.action.mutation({ params: { id, action: a }, body: {} })));
  if (ok) await load();
}
async function invite() {
  if (!selected.value) return;
  const id = selected.value.id;
  const ok = await run(async () => unwrap(await client.editions.invite.mutation({ params: { id }, body: { clubIds: invitees.value } })));
  if (ok) {
    invitees.value = [];
    await select(id);
  }
}

watch(() => route.params.id, () => {
  selected.value = null;
  void load();
});
onMounted(load);
</script>
