<template>
  <v-container fluid class="user-competitions">
    <div class="d-flex align-center flex-wrap ga-3 mb-4">
      <div>
        <div class="text-h5 font-weight-bold">Competitions</div>
        <div class="text-caption text-medium-emphasis">Enter competitions that fit your Level. Matches come from challenges you send and accept.</div>
      </div>
      <v-spacer />
      <v-chip color="indigo" variant="tonal" prepend-icon="mdi-flag">
        Entries {{ store.entriesUsed }} / {{ store.settings?.maxConcurrentEntries ?? '—' }}
      </v-chip>
      <v-chip v-if="club" color="teal" variant="tonal" prepend-icon="mdi-cash">{{ money(club.Budget) }}</v-chip>
      <level-badge v-if="club" :xp="club.XP ?? 0" :thresholds="store.settings?.levelThresholds" :size="40" show-label />
    </div>

    <v-tabs v-model="tab" class="mb-4">
      <v-tab value="open">Open for entry <v-badge v-if="eligibleCount" :content="eligibleCount" color="teal" inline /></v-tab>
      <v-tab value="mine">My competitions</v-tab>
      <v-tab value="past">Past</v-tab>
      <v-tab value="settings">Auto-play</v-tab>
    </v-tabs>

    <v-progress-linear v-if="loading" indeterminate color="teal" class="mb-2" />
    <v-alert v-if="error" type="error" density="compact" class="mb-3">{{ error }}</v-alert>

    <v-window v-model="tab">
      <v-window-item value="open">
        <v-row>
          <v-col v-for="e in openEditions" :key="e.id" cols="12" md="6" lg="4">
            <competition-card :edition="e" :eligibility="e.eligibility" :entry-status="entryStatus(e.id)">
              <template #actions>
                <v-btn
                  v-if="!entryStatus(e.id) || entryStatus(e.id) === 'invited'"
                  color="teal"
                  variant="flat"
                  :disabled="!e.eligibility?.eligible"
                  :loading="busy === e.id"
                  @click="enter(e.id)"
                >
                  Enter{{ e.eligibility?.fee ? ` · ${money(e.eligibility.fee)}` : '' }}
                </v-btn>
                <v-btn v-else-if="entryStatus(e.id) === 'registered'" variant="text" color="red-lighten-2" :loading="busy === e.id" @click="leave(e.id)">
                  Withdraw
                </v-btn>
              </template>
            </competition-card>
          </v-col>
          <v-col v-if="!openEditions.length && !loading" cols="12" class="text-center text-medium-emphasis py-8">
            Nothing is open for entry right now. New competitions appear here when the admin opens them.
          </v-col>
        </v-row>
      </v-window-item>

      <v-window-item value="mine">
        <v-row>
          <v-col v-for="en in store.activeEntries" :key="en.seasonId" cols="12" md="6" lg="4">
            <competition-card :edition="en.edition" :entry-status="en.status" />
          </v-col>
          <v-col v-if="!store.activeEntries.length" cols="12" class="text-center text-medium-emphasis py-8">You're not in any competition.</v-col>
        </v-row>
      </v-window-item>

      <v-window-item value="past">
        <v-table density="compact">
          <thead>
            <tr>
              <th>Competition</th>
              <th>Status</th>
              <th>Result</th>
              <th class="text-right">Ended</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="en in pastEntries" :key="en.seasonId">
              <td><router-link :to="en.edition.status === 'finished' ? `/finish/edition/${en.seasonId}` : `/u/competitions/${en.seasonId}`">{{ en.edition.title }}</router-link></td>
              <td>{{ en.edition.status }}</td>
              <td>
                <v-icon v-if="en.edition.winnerId === store.clubId" color="amber" size="16">mdi-trophy</v-icon>
                {{ en.edition.winnerId === store.clubId ? 'Winner' : en.status }}
              </td>
              <td class="text-right">{{ en.edition.endDay ?? '—' }}</td>
            </tr>
            <tr v-if="!pastEntries.length">
              <td colspan="4" class="text-center text-medium-emphasis py-4">No past competitions</td>
            </tr>
          </tbody>
        </v-table>
      </v-window-item>

      <v-window-item value="settings">
        <v-row v-if="store.clubId">
          <v-col cols="12" md="6"><entry-policy-form :club-id="store.clubId" /></v-col>
          <v-col cols="12" md="6"><challenge-policy-form :club-id="store.clubId" /></v-col>
        </v-row>
      </v-window-item>
    </v-window>

    <v-snackbar v-model="snack.show" :color="snack.error ? 'red-darken-2' : 'teal-darken-2'">{{ snack.text }}</v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import type { EditionListItem } from '@repo/api-contract';
import CompetitionCard from '@/components/open-play/competition-card.vue';
import LevelBadge from '@/components/open-play/level-badge.vue';
import EntryPolicyForm from '@/components/open-play/entry-policy-form.vue';
import ChallengePolicyForm from '@/components/open-play/challenge-policy-form.vue';
import { client } from '@/services/api';
import { unwrap, useOpenPlayStore } from '@/store/open-play';
import { money, useClubDirectory } from '@/helpers/open-play';

const store = useOpenPlayStore();
const dir = useClubDirectory();
const tab = ref('open');
const editions = ref<EditionListItem[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const busy = ref<string | null>(null);
const snack = reactive({ show: false, text: '', error: false });

const club = computed(() => dir.get(store.clubId));
const openEditions = computed(() =>
  [...editions.value].sort((a, b) => Number(!!b.eligibility?.eligible) - Number(!!a.eligibility?.eligible))
);
const eligibleCount = computed(() => openEditions.value.filter((e) => e.eligibility?.eligible && !entryStatus(e.id)).length);
const pastEntries = computed(() => store.entries.filter((e) => ['finished', 'cancelled'].includes(e.edition.status) || ['eliminated', 'withdrawn'].includes(e.status)));
const entryStatus = (editionId: string) => store.entries.find((e) => e.seasonId === editionId)?.status ?? null;

async function load() {
  loading.value = true;
  error.value = null;
  try {
    editions.value = unwrap<EditionListItem[]>(
      await client.editions.list.query({ query: { status: 'registration', eligibleFor: store.clubId ?? undefined } })
    );
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

async function enter(id: string) {
  busy.value = id;
  try {
    await store.register(id);
    Object.assign(snack, { show: true, text: 'Entered', error: false });
    await load();
  } catch (err) {
    const e = err as Error & { reasons?: string[] };
    Object.assign(snack, { show: true, text: [e.message, ...(e.reasons ?? [])].join(' · '), error: true });
  } finally {
    busy.value = null;
  }
}
async function leave(id: string) {
  busy.value = id;
  try {
    await store.withdraw(id);
    Object.assign(snack, { show: true, text: 'Withdrawn', error: false });
    await load();
  } catch (err) {
    Object.assign(snack, { show: true, text: err instanceof Error ? err.message : String(err), error: true });
  } finally {
    busy.value = null;
  }
}

onMounted(() => store.start());
// Eligibility needs the club id, which arrives with the user.
watch(() => store.clubId, () => void load(), { immediate: true });
watch(() => store.editionsVersion, () => void load());
onUnmounted(() => store.stop());
</script>
