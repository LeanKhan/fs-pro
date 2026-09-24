<template>
  <v-container fluid class="edition-page">
    <v-progress-linear v-if="loading && !edition" indeterminate color="teal" />
    <v-alert v-if="error" type="error" density="compact" class="mb-3">{{ error }}</v-alert>
    <template v-if="edition">
      <div class="d-flex align-center flex-wrap ga-3 mb-2">
        <v-btn icon="mdi-arrow-left" variant="text" size="small" to="/u/competitions" />
        <div>
          <div class="text-h5 font-weight-bold">{{ edition.title }}</div>
          <div class="text-caption text-medium-emphasis">{{ formatSummary(def) }}</div>
        </div>
        <v-spacer />
        <v-chip :color="STATUS_COLORS[edition.status]" variant="flat">{{ STATUS_LABELS[edition.status] ?? edition.status }}</v-chip>
      </div>
      <stage-timeline :definition="def" :current-stage="edition.currentStage" :status="edition.status" class="mb-4" />

      <v-row>
        <v-col cols="12" lg="8">
          <v-card class="pa-3">
            <div class="d-flex align-center mb-3">
              <div class="text-subtitle-1 font-weight-bold">{{ edition.status === 'registration' ? 'Entrants' : 'Standings' }}</div>
              <v-spacer />
              <v-btn v-if="canChallenge" color="teal" variant="flat" size="small" prepend-icon="mdi-sword-cross" @click="dialog = true">Challenge</v-btn>
            </div>
            <edition-standings
              v-if="edition.status !== 'registration' && edition.status !== 'draft'"
              :edition-id="edition.id"
              :definition="def"
              :current-stage="edition.currentStage"
              :status="edition.status"
              :highlight-club-id="store.clubId"
            />
            <v-list v-else density="compact" class="bg-transparent">
              <v-list-item v-for="en in edition.entries" :key="en.clubId" :title="en.clubName" :subtitle="en.status">
                <template #prepend><club-crest :code="en.clubCode" :name="en.clubName" :size="26" class="mr-3" /></template>
              </v-list-item>
              <div v-if="!edition.entries.length" class="text-medium-emphasis text-center py-4">No entrants yet</div>
            </v-list>
          </v-card>
        </v-col>
        <v-col cols="12" lg="4">
          <v-card class="pa-3 mb-4">
            <div class="text-subtitle-1 font-weight-bold mb-2">Rules</div>
            <div class="text-body-2 d-flex flex-column ga-1">
              <div v-for="line in ruleLines" :key="line"><v-icon size="14" class="mr-1">mdi-circle-small</v-icon>{{ line }}</div>
            </div>
          </v-card>
          <v-card class="pa-3 mb-4">
            <div class="text-subtitle-1 font-weight-bold mb-2">Rewards</div>
            <div v-for="p in prizes" :key="p.position" class="d-flex text-body-2">
              <span>{{ ordinal(p.position) }}</span><v-spacer /><span>{{ money(p.amount) }}</span>
            </div>
            <div v-for="x in xpRewards" :key="`xp${x.position}`" class="d-flex text-body-2 text-medium-emphasis">
              <span>{{ ordinal(x.position) }}</span><v-spacer /><span>+{{ x.amount }} XP</span>
            </div>
            <div v-if="!prizes.length && !xpRewards.length" class="text-medium-emphasis text-caption">No rewards</div>
            <div v-for="o in outcomes" :key="o" class="text-caption mt-1"><v-icon size="14">mdi-arrow-decision</v-icon> {{ o }}</div>
          </v-card>
          <v-card v-if="myEntry || canEnter" class="pa-3 mb-4">
            <div class="text-subtitle-1 font-weight-bold mb-2">Your entry</div>
            <template v-if="myEntry">
              <v-chip :color="STATUS_COLORS[myEntry.status]" size="small">{{ myEntry.status }}</v-chip>
              <v-btn
                v-if="myEntry.status === 'registered'"
                class="ml-2"
                size="small"
                variant="text"
                color="red-lighten-2"
                :loading="busy"
                @click="leave"
              >
                Withdraw
              </v-btn>
            </template>
            <template v-else>
              <div v-for="r in eligibility?.reasons ?? []" :key="r" class="text-caption text-red-lighten-2">
                <v-icon size="14">mdi-lock</v-icon> {{ r }}
              </div>
              <v-btn color="teal" variant="flat" class="mt-2" :disabled="!eligibility?.eligible" :loading="busy" @click="enter">
                Enter{{ eligibility?.fee ? ` · ${money(eligibility.fee)}` : '' }}
              </v-btn>
            </template>
          </v-card>
          <v-card v-if="myChallenges.length" class="pa-3">
            <div class="text-subtitle-1 font-weight-bold mb-2">Your matches here</div>
            <div class="d-flex flex-column ga-2">
              <challenge-card v-for="c in myChallenges" :key="c.id" :challenge="c" :today="store.settings?.currentDay ?? null" />
            </div>
          </v-card>
        </v-col>
      </v-row>
      <challenge-dialog v-model="dialog" :fixed-edition-id="edition.id" @sent="load" />
    </template>
  </v-container>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { EditionDetail, Eligibility } from '@repo/api-contract';
import StageTimeline from '@/components/open-play/stage-timeline.vue';
import EditionStandings from '@/components/open-play/edition-standings.vue';
import ClubCrest from '@/components/open-play/club-crest.vue';
import ChallengeCard from '@/components/open-play/challenge-card.vue';
import ChallengeDialog from '@/components/open-play/challenge-dialog.vue';
import { client } from '@/services/api';
import { unwrap, useOpenPlayStore } from '@/store/open-play';
import { METRIC_LABELS, STATUS_COLORS, STATUS_LABELS, formatSummary, money, type StageLike } from '@/helpers/open-play';

const route = useRoute();
const store = useOpenPlayStore();
const edition = ref<EditionDetail | null>(null);
const eligibility = ref<Eligibility | null>(null);
const loading = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);
const dialog = ref(false);

type Def = {
  Stages?: (StageLike & { rules?: Record<string, unknown>; tieDays?: number; seeding?: string })[];
  Entry?: { minClubs?: number; maxClubs?: number | null; mode?: string };
  WinCondition?: { type: string; metric?: string; target?: number };
  Rewards?: { prizeMoney?: { position: number; amount: number }[]; xp?: { position: number; amount: number }[]; trophy?: string };
  Outcomes?: { type: string; positions: [number, number]; change?: number; targetCompetitionId?: string; editions?: number }[];
};
const def = computed(() => (edition.value?.definition ?? null) as Def | null);
const myEntry = computed(() => edition.value?.entries.find((e) => e.clubId === store.clubId) ?? null);
const canEnter = computed(() => edition.value?.status === 'registration' && !!store.clubId);
const currentStageType = computed(() => def.value?.Stages?.[edition.value?.currentStage ?? 0]?.type);
const canChallenge = computed(
  () => edition.value?.status === 'running' && myEntry.value?.status === 'active' && currentStageType.value !== 'knockout'
);
const myChallenges = computed(() => store.challenges.filter((c) => c.seasonId === edition.value?.id).slice(-8).reverse());
const prizes = computed(() => def.value?.Rewards?.prizeMoney ?? []);
const xpRewards = computed(() => def.value?.Rewards?.xp ?? []);
const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;

const ruleLines = computed(() => {
  const d = def.value;
  if (!d) return [];
  const lines: string[] = [];
  const w = d.WinCondition;
  if (w?.type === 'first-to') lines.push(`First to ${w.target} ${w.metric} wins`);
  else if (w?.type === 'best-at-end') lines.push(`Best ${METRIC_LABELS[w.metric ?? 'points']?.toLowerCase()} at the end wins`);
  else if (w?.type === 'last-standing') lines.push('Last club standing wins');
  else lines.push('The final stage decides the winner');
  (d.Stages ?? []).forEach((s, i) => {
    const r = (s.rules ?? {}) as { metric?: string; minGamesToRank?: number; maxVsSameOpponent?: number; respondWithinDays?: number; challengeRange?: number };
    if (s.type === 'knockout') {
      lines.push(`Stage ${i + 1}: ${s.legs === 2 ? 'two-leg' : 'single-leg'} ties, ${s.tieDays} days each, seeded by ${s.seeding}`);
      return;
    }
    const parts = [`Stage ${i + 1}: ranked by ${METRIC_LABELS[r.metric ?? 'points']?.toLowerCase() ?? r.metric}`];
    if (r.minGamesToRank) parts.push(`${r.minGamesToRank} games to be ranked`);
    if (r.maxVsSameOpponent) parts.push(`max ${r.maxVsSameOpponent} vs the same club`);
    if (r.respondWithinDays) parts.push(`answer challenges within ${r.respondWithinDays} days`);
    if (r.challengeRange) parts.push(`challenge within ${r.challengeRange} ranks`);
    lines.push(parts.join(', '));
  });
  return lines;
});
const outcomes = computed(() =>
  (def.value?.Outcomes ?? []).map((o) => {
    const pos = o.positions[0] === o.positions[1] ? `Rank ${o.positions[0]}` : `Ranks ${o.positions[0]}–${o.positions[1]}`;
    if (o.type === 'level') return `${pos}: Level ${o.change === 1 ? 'up' : 'down'}`;
    if (o.type === 'qualify') return `${pos}: qualify for another competition`;
    return `${pos}: barred from another competition for ${o.editions} editions`;
  })
);

async function load() {
  const id = String(route.params.id);
  loading.value = true;
  error.value = null;
  try {
    edition.value = unwrap<EditionDetail>(await client.editions.get.query({ params: { id } }));
    if (store.clubId && edition.value.status === 'registration' && !myEntry.value)
      eligibility.value = unwrap<Eligibility>(await client.editions.eligibility.query({ params: { id, clubId: store.clubId } }));
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}
async function enter() {
  busy.value = true;
  try {
    await store.register(String(route.params.id));
    await load();
  } catch (err) {
    const e = err as Error & { reasons?: string[] };
    error.value = [e.message, ...(e.reasons ?? [])].join(' · ');
  } finally {
    busy.value = false;
  }
}
async function leave() {
  busy.value = true;
  try {
    await store.withdraw(String(route.params.id));
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

watch([() => route.params.id, () => store.clubId], () => void load());
watch(
  () => store.editionsVersion,
  () => {
    if (store.touchedEditions.has(String(route.params.id))) void load();
  }
);
onMounted(() => {
  store.start();
  void load();
});
onUnmounted(() => store.stop());
</script>
