<template>
  <v-card variant="tonal" class="pa-3">
    <div class="d-flex align-center mb-2">
      <div class="text-subtitle-1 font-weight-bold">Auto-enter competitions</div>
      <v-spacer />
      <v-switch v-model="form.autoRegister" color="teal" hide-details density="compact" inset />
    </div>
    <div class="text-caption text-medium-emphasis mb-3">
      Register for competitions you're eligible for while you're away. Entries count toward the same cap as everyone.
    </div>
    <v-row dense>
      <v-col cols="6">
        <v-text-field v-model.number="form.maxFee" type="number" label="Max entry fee" prefix="€" density="compact" variant="outlined" clearable :disabled="!form.autoRegister" />
      </v-col>
      <v-col cols="6">
        <v-text-field v-model.number="form.maxEntries" type="number" label="Stop at N entries" density="compact" variant="outlined" clearable :disabled="!form.autoRegister" />
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
import type { EntryPolicy } from '@repo/api-contract';
import { client } from '@/services/api';
import { unwrap } from '@/store/open-play';

const props = defineProps<{ clubId: string }>();

const form = reactive<{ autoRegister: boolean; maxFee: number | null; maxEntries: number | null }>({
  autoRegister: false,
  maxFee: null,
  maxEntries: null,
});
const saving = ref(false);
const message = ref('');
const failed = ref(false);

onMounted(async () => {
  try {
    const p = unwrap<EntryPolicy | null>(await client.editions.getEntryPolicy.query({ params: { clubId: props.clubId } }));
    if (p) Object.assign(form, { maxFee: null, maxEntries: null, ...p });
  } catch {
    /* no policy yet */
  }
});

const num = (v: number | null | string) => (v === null || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v));

async function save() {
  saving.value = true;
  message.value = '';
  try {
    const policy: EntryPolicy = { autoRegister: form.autoRegister, maxFee: num(form.maxFee), maxEntries: num(form.maxEntries) };
    unwrap(await client.editions.setEntryPolicy.mutation({ params: { clubId: props.clubId }, body: { policy } }));
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
