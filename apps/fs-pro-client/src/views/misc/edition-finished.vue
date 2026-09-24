<template>
  <v-container class="edition-finished">
    <v-progress-linear v-if="loading" indeterminate color="amber" />
    <v-alert v-if="error" type="error" density="compact">{{ error }}</v-alert>
    <template v-if="edition">
      <div class="text-center my-6">
        <div class="text-overline text-medium-emphasis">{{ edition.status === 'finished' ? 'Final' : 'So far' }}</div>
        <div class="text-h4 font-weight-black">{{ edition.title }}</div>
        <div v-if="edition.winnerId" class="d-flex flex-column align-center mt-4">
          <v-icon color="amber" size="64">mdi-trophy</v-icon>
          <club-crest :code="dir.code(edition.winnerId)" :size="56" class="my-2" />
          <div class="text-h5 font-weight-bold">{{ dir.name(edition.winnerId) }}</div>
          <div v-if="trophy" class="text-caption text-medium-emphasis">{{ trophy }}</div>
          <v-chip v-if="edition.winnerId === store.clubId" color="amber" class="mt-2" prepend-icon="mdi-party-popper">You won!</v-chip>
        </div>
        <div v-else-if="edition.status === 'cancelled'" class="text-medium-emphasis mt-3">Cancelled. Entry fees were refunded.</div>
      </div>

      <v-row>
        <v-col cols="12" md="8">
          <v-card class="pa-3">
            <div class="text-subtitle-1 font-weight-bold mb-2">Final standings</div>
            <edition-standings
              :edition-id="edition.id"
              :definition="edition.definition"
              :current-stage="lastStage"
              :status="edition.status"
              :highlight-club-id="store.clubId"
            />
          </v-card>
        </v-col>
        <v-col cols="12" md="4">
          <v-card class="pa-3 mb-4">
            <div class="text-subtitle-1 font-weight-bold mb-2">Rewards paid</div>
            <div v-for="p in prizes" :key="`m${p.position}`" class="d-flex text-body-2">
              <span>{{ ordinal(p.position) }}</span><v-spacer /><span>{{ money(p.amount) }}</span>
            </div>
            <div v-for="x in xp" :key="`x${x.position}`" class="d-flex text-body-2 text-medium-emphasis">
              <span>{{ ordinal(x.position) }}</span><v-spacer /><span>+{{ x.amount }} XP</span>
            </div>
            <div v-if="!prizes.length && !xp.length" class="text-caption text-medium-emphasis">No rewards</div>
          </v-card>
          <v-card v-if="myFinish" class="pa-3 mb-4">
            <div class="text-subtitle-1 font-weight-bold mb-1">Your finish</div>
            <div class="text-h5">{{ myFinish.finalPosition ? ordinal(myFinish.finalPosition) : '—' }}</div>
            <div class="text-caption text-medium-emphasis">
              Board score {{ myFinish.finishScore?.toFixed(2) ?? '—' }} · Prestige {{ '★'.repeat(myFinish.prestige) }}
            </div>
          </v-card>
          <div class="d-flex flex-column ga-2">
            <v-btn variant="tonal" :to="`/u/stats/season/${edition.id}`" prepend-icon="mdi-chart-areaspline">Player stats</v-btn>
            <v-btn variant="tonal" :to="`/u/competitions/${edition.id}`">Competition page</v-btn>
            <v-btn color="amber" variant="flat" to="/u">Continue</v-btn>
          </div>
        </v-col>
      </v-row>
    </template>
  </v-container>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { EditionDetail } from '@repo/api-contract';
import ClubCrest from '@/components/open-play/club-crest.vue';
import EditionStandings from '@/components/open-play/edition-standings.vue';
import { client } from '@/services/api';
import { unwrap, useOpenPlayStore } from '@/store/open-play';
import { money, useClubDirectory } from '@/helpers/open-play';

/** Edition finished (spec "UI → User"): winner, final table or bracket,
 * rewards, and the user's finish. */
const route = useRoute();
const store = useOpenPlayStore();
const dir = useClubDirectory();
const edition = ref<EditionDetail | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

type Def = {
  Stages?: unknown[];
  Rewards?: { prizeMoney?: { position: number; amount: number }[]; xp?: { position: number; amount: number }[]; trophy?: string };
};
const def = computed(() => (edition.value?.definition ?? null) as Def | null);
const lastStage = computed(() => Math.max(0, (def.value?.Stages?.length ?? 1) - 1));
const prizes = computed(() => def.value?.Rewards?.prizeMoney ?? []);
const xp = computed(() => def.value?.Rewards?.xp ?? []);
const trophy = computed(() => def.value?.Rewards?.trophy ?? '');
const myFinish = computed(() => store.performance?.finishes.find((f) => f.seasonId === edition.value?.id) ?? null);
const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;

onMounted(async () => {
  void store.refresh();
  loading.value = true;
  try {
    edition.value = unwrap<EditionDetail>(await client.editions.get.query({ params: { id: String(route.params.id) } }));
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
});
</script>
