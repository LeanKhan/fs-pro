<template>
  <v-card variant="tonal" class="pa-3">
    <div class="d-flex align-center mb-2">
      <div class="text-subtitle-1 font-weight-bold">Challenge auto-answer</div>
      <v-spacer />
      <v-switch v-model="form.autoAccept" color="teal" hide-details density="compact" inset />
    </div>
    <div class="text-caption text-medium-emphasis mb-3">
      When you're away, accept challenges that fit these rules. Unanswered challenges expire, and declining too often
      forfeits the match 3-0.
    </div>
    <v-row dense :class="{ 'opacity-60': !form.autoAccept }">
      <v-col cols="6">
        <v-text-field v-model.number="form.maxEloGap" type="number" label="Max Elo gap" density="compact" variant="outlined" clearable :disabled="!form.autoAccept" />
      </v-col>
      <v-col cols="6">
        <v-text-field v-model.number="form.minSquadFitness" type="number" label="Min squad fitness %" density="compact" variant="outlined" clearable :disabled="!form.autoAccept" />
      </v-col>
      <v-col cols="6">
        <v-text-field v-model.number="form.maxPerWeek" type="number" label="Max per 7 days" density="compact" variant="outlined" clearable :disabled="!form.autoAccept" />
      </v-col>
      <v-col cols="6">
        <v-switch v-model="form.declineOutsidePolicy" label="Decline the rest" color="red-lighten-2" density="compact" hide-details :disabled="!form.autoAccept" />
      </v-col>
    </v-row>
    <div class="d-flex justify-end ga-2 mt-2">
      <span v-if="message" class="text-caption align-self-center" :class="failed ? 'text-red' : 'text-teal'">{{ message }}</span>
      <v-btn color="teal" variant="flat" size="small" :loading="saving" @click="save">Save</v-btn>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import type { ChallengePolicy } from '@repo/api-contract';
import { client } from '@/services/api';
import { unwrap } from '@/store/open-play';

const props = defineProps<{ clubId: string }>();

type Form = { autoAccept: boolean; maxEloGap: number | null; minSquadFitness: number | null; maxPerWeek: number | null; declineOutsidePolicy: boolean };
const form = reactive<Form>({ autoAccept: false, maxEloGap: null, minSquadFitness: null, maxPerWeek: null, declineOutsidePolicy: false });
const saving = ref(false);
const message = ref('');
const failed = ref(false);

onMounted(async () => {
  try {
    const p = unwrap<ChallengePolicy | null>(await client.challenges.getPolicy.query({ params: { clubId: props.clubId } }));
    if (p) Object.assign(form, { maxEloGap: null, minSquadFitness: null, maxPerWeek: null, ...p });
  } catch {
    /* no policy yet */
  }
});

const num = (v: number | null | string) => (v === null || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v));

async function save() {
  saving.value = true;
  message.value = '';
  try {
    const policy: ChallengePolicy = {
      autoAccept: form.autoAccept,
      declineOutsidePolicy: form.declineOutsidePolicy,
      maxEloGap: num(form.maxEloGap),
      minSquadFitness: num(form.minSquadFitness),
      maxPerWeek: num(form.maxPerWeek),
    };
    unwrap(await client.challenges.setPolicy.mutation({ params: { clubId: props.clubId }, body: { policy } }));
    failed.value = false;
    message.value = 'Saved';
  } catch (err) {
    failed.value = true;
    message.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}
</script>
