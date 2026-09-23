<template>
  <v-dialog v-model="show" max-width="520">
    <v-card v-if="asset" class="facility-sheet pa-5 rounded-2xl">
      <!-- Header -->
      <div class="d-flex justify-space-between align-start mb-3">
        <div class="d-flex align-center gap-3">
          <div class="facility-sheet-icon-box d-flex align-center justify-center rounded-xl">
            <span class="facility-sheet-icon">{{ icon }}</span>
          </div>
          <div>
            <div class="text-h6 font-weight-bold text-white">{{ asset.name }}</div>
            <v-chip size="x-small" color="indigo" variant="flat" class="font-weight-bold mt-1">
              Level {{ asset.level }} / {{ asset.maxLevel }}
            </v-chip>
          </div>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="show = false"></v-btn>
      </div>

      <div class="text-body-2 text-medium-emphasis mb-4">
        {{ asset.description }}
      </div>

      <!-- Upgrading: progress only -->
      <div v-if="asset.upgrade" class="upgrade-progress-box pa-3 rounded-xl mb-3">
        <div class="d-flex justify-space-between text-caption font-weight-medium mb-1">
          <span class="text-white">Upgrading to Level {{ asset.upgrade.toLevel }}</span>
          <span class="text-amber">⏱️ {{ formatDuration(secondsRemaining) }}</span>
        </div>
        <v-progress-linear :model-value="progressPercent" color="amber" height="8" rounded></v-progress-linear>
      </div>

      <!-- Not upgrading: current vs next tier comparison -->
      <template v-else>
        <div class="tier-compare mb-3" :class="{ 'single-tier': !nextVisible }">
          <!-- Current tier -->
          <div class="tier-card pa-3 rounded-xl">
            <div class="text-caption font-weight-bold text-indigo-lighten-2 text-uppercase mb-2">
              Current · Lv {{ asset.level }}
            </div>
            <div class="text-body-2 text-white">{{ asset.effectLabel }}</div>
          </div>

          <!-- Next tier -->
          <div v-if="nextVisible" class="tier-card tier-card-next pa-3 rounded-xl">
            <div class="d-flex align-center justify-space-between mb-2">
              <span class="text-caption font-weight-bold text-amber text-uppercase">Next · Lv {{ asset.next!.level }}</span>
              <span class="text-amber">⚡</span>
            </div>
            <div class="text-body-2 text-white">{{ asset.next!.effectLabel }}</div>
          </div>
        </div>

        <!-- Cost & requirement bar -->
        <div v-if="nextVisible" class="cost-bar pa-3 rounded-xl mb-3">
          <div class="d-flex align-center justify-space-between">
            <div>
              <div class="text-body-2 font-weight-bold text-white">
                Upgrade Cost: <span class="text-success">{{ formatCurrency(asset.next!.cost) }}</span>
              </div>
              <div v-if="budget != null" class="text-caption" :class="canAfford ? 'text-success' : 'text-error'">
                Available: {{ formatCurrency(budget) }} {{ canAfford ? '(Ready)' : '(Short)' }}
              </div>
            </div>
            <div class="d-flex align-center gap-1 text-medium-emphasis text-caption">
              <span>⏱️</span>
              <span>{{ formatDuration(asset.next!.minutes * 60) }}</span>
            </div>
          </div>
        </div>

        <v-btn
          v-if="nextVisible && !readOnly"
          block
          size="large"
          color="amber-darken-2"
          class="font-weight-bold"
          variant="flat"
          :disabled="!!asset.next!.blockedReason || upgrading || !canAfford"
          :loading="upgrading"
          @click="onUpgrade"
        >
          Upgrade to Level {{ asset.next!.level }}
        </v-btn>

        <div v-if="nextVisible && asset.next!.blockedReason" class="text-caption text-warning text-center mt-2">
          {{ asset.next!.blockedReason }}
        </div>
        <div v-else-if="nextVisible && !canAfford" class="text-caption text-error text-center mt-2">
          Not enough cash for this upgrade yet.
        </div>

        <div v-if="!asset.next" class="text-center py-3 text-caption text-medium-emphasis">
          ⭐ Maximum facility level reached!
        </div>
      </template>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
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
    /** Club treasury, for the "can you afford this" check; omit to hide it. */
    budget?: number | null;
  }>(),
  {
    modelValue: false,
    asset: null,
    icon: '🏛️',
    readOnly: false,
    upgrading: false,
    nowMs: Date.now(),
    budget: null,
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

// The next-tier card only makes sense when there's a next level to show.
const nextVisible = computed(() => !!props.asset?.next);
const canAfford = computed(() => {
  if (props.budget == null || !props.asset?.next) return true;
  return props.budget >= props.asset.next.cost;
});

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
.cost-bar {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.tier-compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.tier-compare.single-tier {
  grid-template-columns: 1fr;
}
.tier-card {
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.25);
}
.tier-card-next {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.35);
}
</style>
