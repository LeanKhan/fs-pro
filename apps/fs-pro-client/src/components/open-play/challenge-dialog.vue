<template>
  <v-dialog :model-value="modelValue" max-width="560" scrollable @update:model-value="emit('update:modelValue', $event)">
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2">mdi-sword-cross</v-icon>
        Challenge a club
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" size="small" @click="emit('update:modelValue', false)" />
      </v-card-title>
      <v-card-text>
        <v-select
          v-model="editionId"
          :items="editionItems"
          label="Competition"
          density="compact"
          variant="outlined"
          :disabled="!!fixedEditionId"
        />
        <v-text-field v-model="search" density="compact" variant="outlined" prepend-inner-icon="mdi-magnify" label="Find a club" clearable />
        <v-progress-linear v-if="loading" indeterminate color="teal" class="mb-2" />
        <v-alert v-if="error" type="error" density="compact" class="mb-2">{{ error }}</v-alert>
        <v-list density="compact" class="bg-transparent">
          <v-list-item
            v-for="o in filtered"
            :key="o.clubId"
            :disabled="!o.eligible"
            :active="picked === o.clubId"
            @click="picked = o.clubId"
          >
            <template #prepend>
              <club-crest :code="o.clubCode" :name="o.name" :size="28" class="mr-3" />
            </template>
            <v-list-item-title>{{ o.name }}</v-list-item-title>
            <v-list-item-subtitle>
              <template v-if="o.rank != null">Rank {{ o.rank }} · </template>Elo {{ Math.round(o.elo) }}
              <template v-if="!o.eligible"> · {{ o.reasons.join('; ') }}</template>
            </v-list-item-subtitle>
            <template #append>
              <v-icon v-if="picked === o.clubId" color="teal">mdi-check-circle</v-icon>
              <v-icon v-else-if="!o.eligible" size="small">mdi-lock</v-icon>
            </template>
          </v-list-item>
          <div v-if="!loading && editionId && !filtered.length" class="text-center text-medium-emphasis py-4">No opponents</div>
        </v-list>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">Cancel</v-btn>
        <v-btn color="teal" variant="flat" :disabled="!picked" :loading="sending" @click="send">Send challenge</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { OpponentOption } from '@repo/api-contract';
import ClubCrest from './club-crest.vue';
import { client } from '@/services/api';
import { unwrap, useOpenPlayStore } from '@/store/open-play';

/** Pick a competition (league/groups stage you're in) and an opponent. Clubs
 * you can't challenge are listed with the reason. */
const props = withDefaults(
  defineProps<{ modelValue: boolean; fixedEditionId?: string | null; preselectClubId?: string | null }>(),
  { fixedEditionId: null, preselectClubId: null }
);
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'sent', message: string): void }>();

const store = useOpenPlayStore();
const editionId = ref<string | null>(null);
const options = ref<OpponentOption[]>([]);
const loading = ref(false);
const sending = ref(false);
const error = ref<string | null>(null);
const search = ref('');
const picked = ref<string | null>(null);

type StageType = 'league' | 'groups' | 'knockout';
const editionItems = computed(() =>
  store.activeEntries
    .filter((e) => e.edition.status === 'running' && e.status === 'active')
    .filter((e) => {
      const stages = (e.edition.definition as { Stages?: { type: StageType }[] } | null)?.Stages ?? [];
      return stages[e.edition.currentStage]?.type !== 'knockout';
    })
    .map((e) => ({ title: e.edition.title, value: e.edition.id }))
);
const filtered = computed(() => {
  const q = (search.value ?? '').toLowerCase();
  const list = options.value.filter((o) => !q || o.name.toLowerCase().includes(q) || o.clubCode.toLowerCase().includes(q));
  return [...list].sort((a, b) => Number(b.eligible) - Number(a.eligible) || (a.rank ?? 999) - (b.rank ?? 999));
});

async function load() {
  options.value = [];
  picked.value = null;
  error.value = null;
  if (!editionId.value || !store.clubId) return;
  loading.value = true;
  try {
    options.value = unwrap<OpponentOption[]>(
      await client.editions.eligibleOpponents.query({ params: { id: editionId.value, clubId: store.clubId } })
    );
    if (props.preselectClubId && options.value.some((o) => o.clubId === props.preselectClubId && o.eligible)) picked.value = props.preselectClubId;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    editionId.value = props.fixedEditionId ?? editionItems.value[0]?.value ?? null;
    void load();
  },
  { immediate: true }
);
watch(editionId, () => void load());

async function send() {
  if (!editionId.value || !picked.value) return;
  sending.value = true;
  error.value = null;
  try {
    await store.propose(editionId.value, picked.value);
    emit('sent', 'Challenge sent');
    emit('update:modelValue', false);
  } catch (err) {
    const e = err as Error & { reasons?: string[] };
    error.value = [e.message, ...(e.reasons ?? [])].join(' · ');
  } finally {
    sending.value = false;
  }
}
</script>
