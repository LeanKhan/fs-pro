<template>
  <v-dialog
    :model-value="show"
    @update:model-value="$emit('update:show', $event)"
    width="720"
    persistent
  >
    <v-card class="pa-0" :loading="loading">
      <v-card-title class="text-h5 bg-cyan-darken-2" primary-title>
        Hire a new Manager
        <v-spacer></v-spacer>
        <v-btn size="small" icon aria-label="Close" @click="close">
          <v-icon size="small">mdi-close</v-icon>
        </v-btn>
      </v-card-title>
      <v-card-text>
        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-3">{{ error }}</v-alert>
        <v-row dense no-gutters>
          <v-col dense cols="6">
            <v-card flat tile v-if="selected" class="pa-2">
              <v-card-title class="text-subtitle-1 pa-2">
                {{ selected.firstName }} {{ selected.lastName }}
              </v-card-title>
              <v-list density="compact">
                <v-list-item>
                  <strong>Age:</strong>&nbsp;{{ selected.age }}
                </v-list-item>
                <v-list-item>
                  <strong>Overall:</strong>&nbsp;{{ range(selected.overall) }}
                </v-list-item>
                <v-list-item>
                  <strong>Preferred:</strong>&nbsp;{{ selected.preferredFormation || '4-3-3' }}
                  <span v-if="selected.preferredStyle">&nbsp;·&nbsp;{{ selected.preferredStyle }}</span>
                </v-list-item>
                <v-list-item>
                  <strong>Signing fee:</strong>&nbsp;{{ currency(selected.effectiveFee) }}
                </v-list-item>
                <v-list-item>
                  <strong>Wage:</strong>&nbsp;{{ currency(selected.wage) }}<span>/yr</span>
                </v-list-item>
                <v-list-item v-if="!selected.interviewed" class="text-caption text-medium-emphasis">
                  Attributes stay a range until you interview him.
                </v-list-item>
              </v-list>
            </v-card>
            <v-sheet v-else height="100" class="d-flex align-center justify-center text-medium-emphasis">
              Select a manager to hire!
            </v-sheet>
          </v-col>

          <v-col cols="6">
            <v-progress-linear v-if="loading" indeterminate class="mb-1"></v-progress-linear>
            <v-list density="compact" max-height="400px" class="overflow-y-auto">
              <v-list-item
                v-for="m in managers"
                :key="m.id"
                :value="m.id"
                :active="selectedId === m.id"
                @click="selectedId = m.id"
                color="cyan-darken-1"
              >
                <template v-slot:prepend>
                  <v-avatar size="30" color="yellow">
                    <span>{{ m.firstName.charAt(0) + m.lastName.charAt(0) }}</span>
                  </v-avatar>
                </template>
                <v-list-item-title>{{ m.firstName }} {{ m.lastName }}</v-list-item-title>
                <v-list-item-subtitle>
                  {{ range(m.overall) }} · {{ currency(m.effectiveFee) }}
                </v-list-item-subtitle>
              </v-list-item>
              <v-list-item v-if="!loading && !managers.length">
                <v-list-item-title class="text-medium-emphasis">No managers available right now.</v-list-item-title>
              </v-list-item>
            </v-list>

            <div class="text-caption mt-2">Contract length (years)</div>
            <v-btn-toggle v-model="contractYears" density="compact" mandatory class="mt-1">
              <v-btn v-for="y in [1, 2, 3, 4, 5]" :key="y" :value="y" size="small">{{ y }}</v-btn>
            </v-btn-toggle>
          </v-col>
        </v-row>
      </v-card-text>

      <v-card-actions class="pa-3">
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="close">Not yet</v-btn>
        <v-btn
          color="primary"
          :loading="saving"
          :disabled="saving || !selected"
          @click="hireManager"
        >
          {{ selected ? `Sign for ${currency(selected.effectiveFee)}` : 'Sign' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { AttributeRange, ProgramManager } from '@repo/api-contract';
import { currency } from '@/helpers/misc';
import { client } from '@/services/api';

/**
 * The Owner's office "Hire Head Coach" flow. It goes through the owner-program
 * manager market (`/program/:clubId/managers`), which a club owner is allowed
 * to call — the old path used the admin-only `clubs.hireManager` route and
 * 403'd for every real owner, which dead-ended the first hour (U-01 / P02-13).
 * The program market also charges the real fee and applies the interview
 * discount, so this no longer bypasses the economy, and a refusal is shown
 * instead of being swallowed to the console.
 */

interface Props {
  show: any;
  /** The club id (kept as `club` for call-site compatibility). */
  club: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:show': [value: boolean];
  'update-available': [];
}>();

const managers = ref<ProgramManager[]>([]);
const selectedId = ref<string | null>(null);
const contractYears = ref(3);
const loading = ref(false);
const saving = ref(false);
const error = ref('');

const selected = computed(() => managers.value.find((m) => m.id === selectedId.value) ?? null);
const range = (r: AttributeRange | undefined) => (r ? (r.low === r.high ? `${r.low}` : `${r.low}–${r.high}`) : '—');

const close = () => emit('update:show', false);

async function load() {
  if (!props.club) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await client.program.browseManagers.query({ params: { clubId: props.club } });
    if (res.status === 200) {
      managers.value = res.body.payload.managers;
      selectedId.value = managers.value[0]?.id ?? null;
    } else {
      error.value = (res.body as { message?: string }).message ?? 'Could not load the manager market.';
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load the manager market.';
  } finally {
    loading.value = false;
  }
}

async function hireManager() {
  const pick = selected.value;
  if (!pick) return;
  saving.value = true;
  error.value = '';
  try {
    const res = await client.program.signManager.mutation({
      params: { clubId: props.club, managerId: pick.id },
      body: { contractYears: contractYears.value },
    });
    if (res.status === 200) {
      emit('update-available');
      close();
    } else {
      error.value = (res.body as { message?: string }).message ?? 'Could not sign that manager.';
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not sign that manager.';
  } finally {
    saving.value = false;
  }
}

watch(
  [() => props.show, () => props.club],
  ([open]) => {
    if (open) load();
  },
  { immediate: true }
);
</script>
