<template>
  <v-card class="pa-4 elevation-3 mb-4">
    <div class="text-h6 font-weight-bold d-flex justify-space-between align-center mb-1">
      <span>Club Facilities</span>
      <v-chip v-if="campus" size="small" color="primary">
        Builders {{ campus.activeUpgrades }} / {{ campus.maxConcurrentUpgrades }}
      </v-chip>
    </div>
    <p class="text-caption text-medium-emphasis mb-3">
      Upgrades cost cash and take real time to build - they keep progressing while you are away.
    </p>

    <div v-if="loading && !campus" class="text-center pa-4">
      <v-progress-circular indeterminate size="28"></v-progress-circular>
    </div>
    <v-alert v-else-if="error" type="error" variant="tonal" density="compact">{{ error }}</v-alert>

    <v-row v-else-if="campus">
      <v-col v-for="asset in campus.assets" :key="asset.type" cols="12" sm="6">
        <v-card variant="outlined" class="pa-3 h-100 d-flex flex-column">
          <div class="d-flex justify-space-between align-center">
            <div class="font-weight-bold text-body-2">{{ asset.name }}</div>
            <v-chip size="x-small" :color="asset.level >= asset.maxLevel ? 'success' : 'primary'">
              Level {{ asset.level }} / {{ asset.maxLevel }}
            </v-chip>
          </div>
          <div class="text-caption text-medium-emphasis">{{ asset.description }}</div>
          <div class="text-body-2 mt-2">{{ asset.effectLabel }}</div>

          <div v-if="asset.upgrade" class="mt-3">
            <div class="text-caption">
              Building level {{ asset.upgrade.toLevel }} - {{ formatDuration(secondsLeft(asset)) }} left
            </div>
            <v-progress-linear
              :model-value="progress(asset)"
              color="info"
              height="8"
              rounded
              class="mt-1"
            ></v-progress-linear>
          </div>

          <div v-else-if="asset.next && !readOnly" class="mt-3 mt-auto pt-2">
            <div class="text-caption text-medium-emphasis mb-1">
              Next: {{ asset.next.effectLabel }} - {{ currency(asset.next.cost) }},
              {{ formatDuration(asset.next.minutes * 60) }}
            </div>
            <v-btn
              size="small"
              color="indigo"
              variant="flat"
              :disabled="!!asset.next.blockedReason || upgrading !== null"
              :loading="upgrading === asset.type"
              @click="upgrade(asset.type)"
            >
              Upgrade to level {{ asset.next.level }}
            </v-btn>
            <div v-if="asset.next.blockedReason" class="text-caption text-warning mt-1">
              {{ asset.next.blockedReason }}
            </div>
          </div>
        </v-card>
      </v-col>
    </v-row>

    <v-snackbar v-model="snackbar" :timeout="3000" :color="snackbarColor">{{ snackbarText }}</v-snackbar>
  </v-card>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Campus, AssetState } from '@repo/api-contract';
import { currency } from '@/helpers/misc';
import { client } from '@/services/api';

const props = withDefaults(defineProps<{ clubId?: string | null; readOnly?: boolean }>(), {
  readOnly: false,
});
const emit = defineEmits<{ (e: 'update-available'): void }>();

const campus = ref<Campus | null>(null);
const loading = ref(false);
const error = ref('');
const upgrading = ref<string | null>(null);
const snackbar = ref(false);
const snackbarText = ref('');
const snackbarColor = ref('success');

function toast(text: string, color = 'success') {
  snackbarText.value = text;
  snackbarColor.value = color;
  snackbar.value = true;
}

/** Ticks every second so build countdowns run locally between fetches. */
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
let reloadingFinished = false;

function secondsLeft(asset: AssetState) {
  const u = asset.upgrade;
  return u ? Math.max(Math.ceil((new Date(u.completeAt).getTime() - now.value) / 1000), 0) : 0;
}

function formatDuration(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function progress(asset: AssetState) {
  const u = asset.upgrade;
  if (!u) return 0;
  const start = new Date(u.startAt).getTime();
  const total = Math.max(new Date(u.completeAt).getTime() - start, 1);
  return Math.min(100, Math.max(0, Math.round(((now.value - start) / total) * 100)));
}

async function load() {
  if (!props.clubId) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await client.facilities.getCampus.query({ params: { clubId: props.clubId } });
    if (res.status === 200) campus.value = res.body.payload;
    else error.value = res.body.message;
  } catch (err) {
    console.error('Failed to load facilities:', err);
    error.value = 'Could not load club facilities.';
  } finally {
    loading.value = false;
  }
}

async function upgrade(assetType: string) {
  if (!props.clubId) return;
  upgrading.value = assetType;
  try {
    const res = await client.facilities.startUpgrade.mutation({
      params: { clubId: props.clubId },
      body: { assetType },
    });
    if (res.status === 200) {
      campus.value = res.body.payload;
      toast('Upgrade started');
      emit('update-available'); // the treasury changed
    } else {
      toast(res.body.message, 'error');
    }
  } catch (err) {
    console.error('Failed to start upgrade:', err);
    toast('Could not start the upgrade.', 'error');
  } finally {
    upgrading.value = null;
  }
}

// When a running upgrade's timer hits zero, fetch the new levels once.
watch(now, () => {
  const done = campus.value?.assets.some((a) => a.upgrade && secondsLeft(a) === 0);
  if (done && !reloadingFinished) {
    reloadingFinished = true;
    load().finally(() => (reloadingFinished = false));
  }
});

watch(() => props.clubId, load, { immediate: true });
onMounted(() => {
  timer = setInterval(() => (now.value = Date.now()), 1000);
});
onBeforeUnmount(() => timer && clearInterval(timer));
defineExpose({ reload: load });
</script>
