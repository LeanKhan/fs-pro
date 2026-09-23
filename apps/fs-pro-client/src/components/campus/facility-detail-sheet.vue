<template>
  <v-dialog v-model="show" max-width="580" scrollable>
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

      <!-- Medical Tab Selector -->
      <div v-if="asset.type === 'medical_centre'" class="d-flex mb-3 rounded-lg pa-1 tab-selector-bar">
        <v-btn
          size="small"
          :variant="activeTab === 'bays' ? 'flat' : 'text'"
          :color="activeTab === 'bays' ? 'teal-darken-1' : undefined"
          class="flex-grow-1 font-weight-bold"
          prepend-icon="mdi-hospital-box"
          @click="activeTab = 'bays'"
        >
          Medical Bay & Treatments
        </v-btn>
        <v-btn
          size="small"
          :variant="activeTab === 'upgrade' ? 'flat' : 'text'"
          :color="activeTab === 'upgrade' ? 'indigo-darken-1' : undefined"
          class="flex-grow-1 font-weight-bold"
          prepend-icon="mdi-arrow-up-bold-circle-outline"
          @click="activeTab = 'upgrade'"
        >
          Facility Upgrade
        </v-btn>
      </div>

      <!-- Feedback Banner -->
      <v-alert
        v-if="feedbackText"
        :type="feedbackType"
        variant="tonal"
        density="compact"
        class="mb-3 text-caption"
        closable
        @click:close="feedbackText = ''"
      >
        {{ feedbackText }}
      </v-alert>

      <!-- ================= MEDICAL BAY TAB ================= -->
      <div v-if="asset.type === 'medical_centre' && activeTab === 'bays'" class="medical-bay-container">
        <!-- Treatment Bays & Squad Recovery Overview -->
        <div class="pa-3 rounded-xl mb-3 medical-overview-card">
          <div class="d-flex align-center justify-space-between mb-2">
            <div class="d-flex align-center gap-2">
              <v-icon color="teal-accent-3" size="20">mdi-hospital-building</v-icon>
              <span class="text-caption font-weight-bold text-teal-accent-2 text-uppercase">
                Active Treatment Bays
              </span>
            </div>
            <v-chip size="x-small" color="teal" variant="flat" class="font-weight-bold">
              {{ medicalStatus?.treatmentBays ?? (1 + Math.floor(asset.level / 2)) }} Available
            </v-chip>
          </div>
          <div class="text-caption text-medium-emphasis mb-3">
            Concentrate medical efforts on individual players or trigger an emergency squad-wide rejuvenation.
          </div>

          <!-- Squad Cryo Card -->
          <div class="pa-3 rounded-lg squad-cryo-card d-flex align-center justify-space-between">
            <div>
              <div class="text-subtitle-2 font-weight-bold text-white d-flex align-center gap-1">
                <span>❄️ Squad Cryotherapy Session</span>
              </div>
              <div class="text-caption text-medium-emphasis">
                +30 Fitness to all squad players &bull; -1 day off all active injuries
              </div>
              <div class="text-caption font-weight-medium text-amber mt-1">
                Cost: {{ formatCurrency(medicalStatus?.costs.squadRecovery ?? 20000) }}
              </div>
            </div>

            <v-btn
              size="small"
              color="teal-darken-1"
              variant="flat"
              class="font-weight-bold ml-2"
              :disabled="readOnly || !medicalStatus?.squadRecovery.available || squadLoading || !canAffordSquadRecovery"
              :loading="squadLoading"
              @click="onSquadRecovery"
            >
              <template v-if="!medicalStatus?.squadRecovery.available && (medicalStatus?.squadRecovery.cooldownSeconds ?? 0) > 0">
                ⏱️ {{ formatDuration(medicalStatus?.squadRecovery.cooldownSeconds ?? 0) }}
              </template>
              <template v-else>
                Boost Squad
              </template>
            </v-btn>
          </div>
        </div>

        <!-- Section: Concentrate on a Player -->
        <div class="d-flex align-center justify-space-between mb-2 px-1">
          <span class="text-caption font-weight-bold text-white text-uppercase">
            Concentrate Care on Player
          </span>
          <span class="text-caption text-medium-emphasis">
            {{ injuredCount }} Injured &bull; {{ fatiguedCount }} Fatigued
          </span>
        </div>

        <div v-if="medicalLoading" class="text-center py-4">
          <v-progress-circular indeterminate color="teal" size="32"></v-progress-circular>
        </div>

        <div v-else-if="injuredCount === 0 && fatiguedCount === 0" class="text-center py-6 pa-4 rounded-xl empty-care-card mb-3">
          <div class="text-h6 mb-1">⭐</div>
          <div class="text-body-2 font-weight-bold text-white">Full Squad Match-Ready!</div>
          <div class="text-caption text-medium-emphasis">
            No active injuries or extreme fatigue reported. Your squad is at peak condition.
          </div>
        </div>

        <div v-else class="player-care-list mb-3">
          <!-- Injured players -->
          <div
            v-for="p in medicalStatus?.injuredPlayers"
            :key="p.id"
            class="pa-3 rounded-xl player-care-row mb-2 border-injury"
          >
            <div class="d-flex align-center justify-space-between mb-2">
              <div class="d-flex align-center gap-2">
                <v-avatar size="28" color="error" class="font-weight-bold text-caption">
                  {{ p.position }}
                </v-avatar>
                <div>
                  <div class="text-body-2 font-weight-bold text-white">{{ p.name }}</div>
                  <div class="text-caption text-error font-weight-medium">
                    🏥 {{ p.injury?.type }} ({{ p.injury?.daysRemaining }}d remaining)
                  </div>
                </div>
              </div>
              <div class="text-caption font-weight-bold text-white">
                Fitness: <span :class="p.fitness < 70 ? 'text-warning' : 'text-success'">{{ p.fitness }}%</span>
              </div>
            </div>

            <!-- Treatment action buttons -->
            <div class="d-flex align-center gap-2 mt-2">
              <v-btn
                size="x-small"
                color="amber-darken-2"
                variant="flat"
                class="font-weight-bold flex-grow-1"
                prepend-icon="mdi-bandage"
                :loading="treatingPlayerId === p.id && treatingType === 'rehab'"
                :disabled="readOnly || !!treatingPlayerId || (budget != null && budget < (medicalStatus?.costs.rehab ?? 16000))"
                @click="onTreatPlayer(p.id, 'rehab')"
              >
                Intensive Rehab ({{ formatCurrency(medicalStatus?.costs.rehab ?? 16000) }})
              </v-btn>

              <v-btn
                v-if="asset.level >= 3 && (p.injury?.daysRemaining ?? 0) >= 4"
                size="x-small"
                color="red-darken-2"
                variant="flat"
                class="font-weight-bold flex-grow-1"
                prepend-icon="mdi-hospital"
                :loading="treatingPlayerId === p.id && treatingType === 'surgery'"
                :disabled="readOnly || !!treatingPlayerId || (budget != null && budget < (medicalStatus?.costs.surgery ?? 45000))"
                @click="onTreatPlayer(p.id, 'surgery')"
              >
                Surgery ({{ formatCurrency(medicalStatus?.costs.surgery ?? 45000) }})
              </v-btn>
            </div>
          </div>

          <!-- Fatigued players -->
          <div
            v-for="p in medicalStatus?.fatiguedPlayers"
            :key="p.id"
            class="pa-3 rounded-xl player-care-row mb-2"
          >
            <div class="d-flex align-center justify-space-between">
              <div class="d-flex align-center gap-2">
                <v-avatar size="28" color="indigo-darken-2" class="font-weight-bold text-caption">
                  {{ p.position }}
                </v-avatar>
                <div>
                  <div class="text-body-2 font-weight-bold text-white">{{ p.name }}</div>
                  <div class="text-caption text-medium-emphasis">
                    Fatigued from recent match intensity
                  </div>
                </div>
              </div>

              <div class="d-flex align-center gap-3">
                <div class="text-caption text-right">
                  <span class="font-weight-bold text-warning">{{ p.fitness }}%</span>
                  <div class="text-caption text-medium-emphasis">Condition</div>
                </div>

                <v-btn
                  size="x-small"
                  color="teal-darken-1"
                  variant="flat"
                  class="font-weight-bold"
                  prepend-icon="mdi-lightning-bolt"
                  :loading="treatingPlayerId === p.id && treatingType === 'hyperbaric'"
                  :disabled="readOnly || !!treatingPlayerId || (budget != null && budget < (medicalStatus?.costs.hyperbaric ?? 9000))"
                  @click="onTreatPlayer(p.id, 'hyperbaric')"
                >
                  Hyperbaric Boost ({{ formatCurrency(medicalStatus?.costs.hyperbaric ?? 9000) }})
                </v-btn>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ================= FACILITY UPGRADE TAB ================= -->
      <div v-else>
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
      </div>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { AssetState, MedicalStatus } from '@repo/api-contract';
import { currency } from '@/helpers/misc';
import { client } from '@/services/api';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    clubId?: string;
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
    clubId: '',
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
  (e: 'treated'): void;
}>();

const show = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val),
});

const formatCurrency = (val: number) => currency(val);

// Tab selection: 'bays' or 'upgrade'
const activeTab = ref<'bays' | 'upgrade'>('bays');

// Medical status and actions
const medicalStatus = ref<MedicalStatus | null>(null);
const medicalLoading = ref(false);
const squadLoading = ref(false);
const treatingPlayerId = ref<string | null>(null);
const treatingType = ref<'rehab' | 'hyperbaric' | 'surgery' | null>(null);

const feedbackText = ref('');
const feedbackType = ref<'success' | 'error'>('success');

const injuredCount = computed(() => medicalStatus.value?.injuredPlayers.length ?? 0);
const fatiguedCount = computed(() => medicalStatus.value?.fatiguedPlayers.length ?? 0);

const canAffordSquadRecovery = computed(() => {
  if (props.budget == null || !medicalStatus.value) return true;
  return props.budget >= medicalStatus.value.costs.squadRecovery;
});

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

async function loadMedicalStatus() {
  if (!props.clubId || props.asset?.type !== 'medical_centre') return;
  medicalLoading.value = true;
  try {
    const res = await client.facilities.getMedicalStatus.query({
      params: { clubId: props.clubId },
    });
    if (res.status === 200) {
      medicalStatus.value = res.body.payload;
    }
  } catch (err) {
    console.error('Failed to load medical status:', err);
  } finally {
    medicalLoading.value = false;
  }
}

async function onSquadRecovery() {
  if (!props.clubId || squadLoading.value) return;
  squadLoading.value = true;
  feedbackText.value = '';
  try {
    const res = await (client.facilities.squadRecovery as any).mutation({
      params: { clubId: props.clubId },
      body: {},
    });
    if (res.status === 200) {
      feedbackType.value = 'success';
      feedbackText.value = res.body.payload.message;
      await loadMedicalStatus();
      emit('treated');
    } else {
      feedbackType.value = 'error';
      feedbackText.value = (res.body as any)?.message || 'Failed to complete squad recovery';
    }
  } catch (err: any) {
    feedbackType.value = 'error';
    feedbackText.value = err?.message || 'Error executing squad recovery';
  } finally {
    squadLoading.value = false;
  }
}

async function onTreatPlayer(playerId: string, type: 'rehab' | 'hyperbaric' | 'surgery') {
  if (!props.clubId || treatingPlayerId.value) return;
  treatingPlayerId.value = playerId;
  treatingType.value = type;
  feedbackText.value = '';
  try {
    const res = await (client.facilities.treatPlayer as any).mutation({
      params: { clubId: props.clubId },
      body: { playerId, treatmentType: type },
    });
    if (res.status === 200) {
      feedbackType.value = 'success';
      feedbackText.value = res.body.payload.message;
      await loadMedicalStatus();
      emit('treated');
    } else {
      feedbackType.value = 'error';
      feedbackText.value = (res.body as any)?.message || 'Treatment failed';
    }
  } catch (err: any) {
    feedbackType.value = 'error';
    feedbackText.value = err?.message || 'Error executing player treatment';
  } finally {
    treatingPlayerId.value = null;
    treatingType.value = null;
  }
}

watch(
  () => [props.modelValue, props.asset?.type],
  ([isOpen, type]) => {
    if (isOpen && type === 'medical_centre') {
      activeTab.value = 'bays';
      loadMedicalStatus();
    } else {
      activeTab.value = 'upgrade';
    }
  },
  { immediate: true }
);
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

.tab-selector-bar {
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.medical-overview-card {
  background: rgba(13, 148, 136, 0.08);
  border: 1px solid rgba(13, 148, 136, 0.25);
}

.squad-cryo-card {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.empty-care-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px dashed rgba(255, 255, 255, 0.15);
}

.player-care-row {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: background 0.2s;
}
.player-care-row:hover {
  background: rgba(255, 255, 255, 0.07);
}

.border-injury {
  border-left: 3px solid #ef4444;
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
