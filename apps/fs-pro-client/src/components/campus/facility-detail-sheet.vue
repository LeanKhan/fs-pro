<template>
  <v-dialog v-model="show" max-width="480">
    <v-card v-if="asset" class="facility-sheet pa-5 rounded-2xl">
      <!-- Header -->
      <div class="d-flex justify-space-between align-start mb-3">
        <div class="d-flex align-center gap-3">
          <div class="facility-sheet-icon-box d-flex align-center justify-center rounded-xl">
            <span class="facility-sheet-icon">{{ icon }}</span>
          </div>
          <div>
            <div class="text-h6 font-weight-bold text-white">{{ asset.name }}</div>
            <div class="text-caption text-medium-emphasis">
              Level {{ asset.level }} / {{ asset.maxLevel }}
            </div>
          </div>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="show = false"></v-btn>
      </div>

      <div class="text-body-2 text-medium-emphasis mb-3">
        {{ asset.description }}
      </div>

      <!-- Current Effect -->
      <v-card variant="tonal" color="indigo-darken-4" class="pa-3 mb-4 rounded-xl">
        <div class="text-caption font-weight-bold text-indigo-lighten-2 mb-1">CURRENT BENEFITS</div>
        <div class="text-body-2 text-white">{{ asset.effectLabel }}</div>
      </v-card>

      <!-- If Currently Upgrading -->
      <div v-if="asset.upgrade" class="upgrade-progress-box pa-3 rounded-xl mb-3">
        <div class="d-flex justify-space-between text-caption font-weight-medium mb-1">
          <span>Upgrading to Level {{ asset.upgrade.toLevel }}</span>
          <span class="text-amber">⏱️ {{ formatDuration(secondsRemaining) }}</span>
        </div>
        <v-progress-linear
          :model-value="progressPercent"
          color="amber"
          height="8"
          rounded
        ></v-progress-linear>
      </div>

      <!-- Next Level Info & Action -->
      <div v-else-if="asset.next && !readOnly" class="next-level-box pa-3 rounded-xl mb-3">
        <div class="text-caption font-weight-bold text-teal-lighten-3 mb-1">NEXT LEVEL UNLOCK</div>
        <div class="text-body-2 text-white mb-2">{{ asset.next.effectLabel }}</div>

        <div class="d-flex justify-space-between align-center text-caption text-medium-emphasis pt-2 border-top">
          <span>Upgrade Cost: <strong class="text-success">{{ formatCurrency(asset.next.cost) }}</strong></span>
          <span>Time: <strong>{{ formatDuration(asset.next.minutes * 60) }}</strong></span>
        </div>

        <v-btn
          block
          size="large"
          color="amber-darken-2"
          class="mt-3 font-weight-bold"
          variant="flat"
          :disabled="!!asset.next.blockedReason || upgrading"
          :loading="upgrading"
          @click="onUpgrade"
        >
          Upgrade to Level {{ asset.next.level }}
        </v-btn>

        <div v-if="asset.next.blockedReason" class="text-caption text-warning text-center mt-2">
          {{ asset.next.blockedReason }}
        </div>
      </div>

      <div v-else-if="asset.level >= asset.maxLevel" class="text-center py-3 text-caption text-medium-emphasis">
        ⭐ Maximum Facility Level Reached!
      </div>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { AssetState } from '@repo/api-contract';
import { currency } from '@/helpers/misc';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    asset?: AssetState | null;
    icon?: string;
    readOnly?: boolean;
    upgrading?: boolean;
    nowMs?: number;
  }>(),
  {
    modelValue: false,
    asset: null,
    icon: '🏛️',
    readOnly: false,
    upgrading: false,
    nowMs: Date.now(),
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'upgrade', assetType: string): void;
}>();

const show = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val),
});

const formatCurrency = (val: number) => currency(val);

const secondsRemaining = computed(() => {
  const u = props.asset?.upgrade;
  if (!u) return 0;
  return Math.max(Math.ceil((new Date(u.completeAt).getTime() - (props.nowMs || Date.now())) / 1000), 0);
});

const progressPercent = computed(() => {
  const u = props.asset?.upgrade;
  if (!u) return 0;
  const start = new Date(u.startAt).getTime();
  const total = Math.max(new Date(u.completeAt).getTime() - start, 1);
  return Math.min(100, Math.max(0, Math.round((((props.nowMs || Date.now()) - start) / total) * 100)));
});

function formatDuration(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function onUpgrade() {
  if (!props.asset) return;
  emit('upgrade', props.asset.type);
}
</script>

<style scoped>
.facility-sheet {
  background: rgba(15, 23, 42, 0.96) !important;
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(16px);
}

.facility-sheet-icon-box {
  width: 44px;
  height: 44px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.facility-sheet-icon {
  font-size: 1.5rem;
}

.upgrade-progress-box,
.next-level-box {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.border-top {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
</style>
