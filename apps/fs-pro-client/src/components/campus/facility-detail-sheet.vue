<template>
  <v-dialog v-model="show" max-width="580" scrollable>
    <v-card v-if="asset" class="facility-sheet pa-5">
      <!-- Header -->
      <div class="d-flex justify-space-between align-start mb-3">
        <div class="d-flex align-center gap-3">
          <div class="facility-sheet-icon-box d-flex align-center justify-center">
            <span class="facility-sheet-icon">{{ icon }}</span>
          </div>
          <div>
            <div class="facility-sheet-title">{{ asset.name }}</div>
            <span class="facility-level-chip">
              Level {{ asset.level }} / {{ asset.maxLevel }}
            </span>
          </div>
        </div>
        <button class="sheet-close-btn" aria-label="Close" @click="show = false">✕</button>
      </div>

      <!-- Medical Tab Selector -->
      <div v-if="asset.type === 'medical_centre'" class="d-flex mb-3 tab-selector-bar">
        <button
          type="button"
          :class="['tab-btn', { active: activeTab === 'bays' }]"
          @click="activeTab = 'bays'"
        >
          🏥 Medical Bay & Care
        </button>
        <button
          type="button"
          :class="['tab-btn', { active: activeTab === 'upgrade' }]"
          @click="activeTab = 'upgrade'"
        >
          ⬆️ Facility Upgrade
        </button>
      </div>

      <!-- Feedback Banner -->
      <div
        v-if="feedbackText"
        :class="['feedback-banner', feedbackType === 'error' ? 'bad' : 'good']"
      >
        <span>{{ feedbackText }}</span>
        <button class="banner-dismiss" @click="feedbackText = ''">✕</button>
      </div>

      <!-- ================= MEDICAL BAY TAB ================= -->
      <div v-if="asset.type === 'medical_centre' && activeTab === 'bays'" class="medical-bay-container">
        <!-- Treatment Bays & Squad Recovery Overview -->
        <div class="pa-4 mb-3 medical-overview-card">
          <div class="d-flex align-center justify-space-between mb-2">
            <div class="d-flex align-center gap-2">
              <span class="overview-tag-label">Active Treatment Bays</span>
            </div>
            <span class="bays-chip">
              {{ medicalStatus?.treatmentBays ?? (1 + Math.floor(asset.level / 2)) }} Available
            </span>
          </div>
          <div class="overview-desc mb-3">
            Concentrate medical staff on individual players or trigger an emergency squad-wide rejuvenation.
          </div>

          <!-- Squad Cryo Card -->
          <div class="pa-3 squad-cryo-card d-flex align-center justify-space-between">
            <div>
              <div class="cryo-title">
                ❄️ Squad Cryotherapy Session
              </div>
              <div class="cryo-desc">
                +30 Fitness to all squad players &bull; -1 day off all active injuries
              </div>
              <div class="cryo-cost mt-1">
                Cost: {{ formatCurrency(medicalStatus?.costs.squadRecovery ?? 20000) }}
              </div>
            </div>

            <button
              type="button"
              class="cozy-btn primary ml-2"
              :disabled="readOnly || !medicalStatus?.squadRecovery.available || squadLoading || !canAffordSquadRecovery"
              @click="onSquadRecovery"
            >
              <template v-if="squadLoading">
                Treating…
              </template>
              <template v-else-if="!medicalStatus?.squadRecovery.available && (medicalStatus?.squadRecovery.cooldownSeconds ?? 0) > 0">
                ⏱️ {{ formatRemainingSeconds(medicalStatus?.squadRecovery.cooldownSeconds ?? 0) }}
              </template>
              <template v-else>
                Boost Squad
              </template>
            </button>
          </div>
        </div>

        <!-- Section: Concentrate on a Player -->
        <div class="d-flex align-center justify-space-between mb-2 px-1">
          <span class="section-label">
            Concentrate Care on Player
          </span>
          <span class="section-sub">
            {{ injuredCount }} Injured &bull; {{ fatiguedCount }} Fatigued
          </span>
        </div>

        <div v-if="medicalLoading" class="text-center py-4 loading-box">
          <v-progress-circular indeterminate color="#5cc23a" size="32"></v-progress-circular>
          <div class="loading-text mt-2">Checking medical records…</div>
        </div>

        <div v-else-if="injuredCount === 0 && fatiguedCount === 0" class="text-center py-5 pa-4 empty-care-card mb-3">
          <div class="empty-star mb-1">⭐</div>
          <div class="empty-title">Full Squad Match-Ready!</div>
          <div class="empty-sub">
            No active injuries or severe fatigue reported. Your squad is at peak fitness.
          </div>
        </div>

        <div v-else class="player-care-list mb-3">
          <!-- Injured players -->
          <div
            v-for="p in medicalStatus?.injuredPlayers"
            :key="p.id"
            class="pa-3 player-care-row mb-2 border-injury"
          >
            <div class="d-flex align-center justify-space-between mb-2">
              <div class="d-flex align-center gap-2">
                <span class="pos-badge pos-injury">{{ p.position }}</span>
                <div>
                  <div class="player-name">{{ p.name }}</div>
                  <div class="injury-tag">
                    🏥 {{ p.injury?.type }} ({{ p.injury?.daysRemaining }}d remaining)
                  </div>
                </div>
              </div>
              <div class="fitness-label">
                Fitness: <span :class="p.fitness < 70 ? 'text-warn' : 'text-good'">{{ p.fitness }}%</span>
              </div>
            </div>

            <!-- Treatment action buttons -->
            <div class="d-flex align-center gap-2 mt-2">
              <button
                type="button"
                class="cozy-btn secondary flex-grow-1"
                :disabled="readOnly || !!treatingPlayerId || (budget != null && budget < (medicalStatus?.costs.rehab ?? 16000))"
                @click="onTreatPlayer(p.id, 'rehab')"
              >
                {{ treatingPlayerId === p.id && treatingType === 'rehab' ? 'Treating…' : `Rehab (${formatCurrency(medicalStatus?.costs.rehab ?? 16000)})` }}
              </button>

              <button
                v-if="asset.level >= 3 && (p.injury?.daysRemaining ?? 0) >= 4"
                type="button"
                class="cozy-btn alert flex-grow-1"
                :disabled="readOnly || !!treatingPlayerId || (budget != null && budget < (medicalStatus?.costs.surgery ?? 45000))"
                @click="onTreatPlayer(p.id, 'surgery')"
              >
                {{ treatingPlayerId === p.id && treatingType === 'surgery' ? 'Operating…' : `Surgery (${formatCurrency(medicalStatus?.costs.surgery ?? 45000)})` }}
              </button>
            </div>
          </div>

          <!-- Fatigued players -->
          <div
            v-for="p in medicalStatus?.fatiguedPlayers"
            :key="p.id"
            class="pa-3 player-care-row mb-2"
          >
            <div class="d-flex align-center justify-space-between">
              <div class="d-flex align-center gap-2">
                <span class="pos-badge">{{ p.position }}</span>
                <div>
                  <div class="player-name">{{ p.name }}</div>
                  <div class="fatigue-sub">Fatigued from recent fixture tempo</div>
                </div>
              </div>

              <div class="d-flex align-center gap-3">
                <div class="text-right">
                  <span class="fitness-num text-warn">{{ p.fitness }}%</span>
                  <div class="condition-label">Condition</div>
                </div>

                <button
                  type="button"
                  class="cozy-btn primary"
                  :disabled="readOnly || !!treatingPlayerId || (budget != null && budget < (medicalStatus?.costs.hyperbaric ?? 9000))"
                  @click="onTreatPlayer(p.id, 'hyperbaric')"
                >
                  {{ treatingPlayerId === p.id && treatingType === 'hyperbaric' ? 'Rejuvenating…' : `Hyperbaric (${formatCurrency(medicalStatus?.costs.hyperbaric ?? 9000)})` }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ================= FACILITY UPGRADE TAB ================= -->
      <div v-else class="facility-upgrade-container">
        <div class="facility-blurb mb-4">
          {{ asset.description }}
        </div>

        <!-- Upgrading: progress only -->
        <div v-if="asset.upgrade" class="upgrade-progress-box pa-4 mb-3">
          <div class="d-flex justify-space-between align-center mb-2">
            <span class="progress-title">Upgrading to Level {{ asset.upgrade.toLevel }}</span>
            <span class="progress-timer">⏱️ {{ formatRemainingSeconds(secondsRemaining) }}</span>
          </div>
          <div class="progress-bar-track">
            <div class="progress-bar-fill" :style="{ width: `${progressPercent}%` }"></div>
          </div>
        </div>

        <!-- Not upgrading: current vs next tier comparison -->
        <template v-else>
          <div class="tier-compare mb-3" :class="{ 'single-tier': !nextVisible }">
            <!-- Current tier -->
            <div class="tier-card pa-3">
              <div class="tier-card-head mb-1">Current · Level {{ asset.level }}</div>
              <div class="tier-card-body">{{ asset.effectLabel }}</div>
            </div>

            <!-- Next tier -->
            <div v-if="nextVisible" class="tier-card tier-card-next pa-3">
              <div class="d-flex align-center justify-space-between mb-1">
                <span class="tier-card-head highlight">Next · Level {{ asset.next!.level }}</span>
                <span>⚡</span>
              </div>
              <div class="tier-card-body">{{ asset.next!.effectLabel }}</div>
            </div>
          </div>

          <!-- Cost & requirement bar -->
          <div v-if="nextVisible" class="cost-bar pa-3 mb-3">
            <div class="d-flex align-center justify-space-between">
              <div>
                <div class="cost-amount">
                  Upgrade Cost: <span class="cost-cash">{{ formatCurrency(asset.next!.cost) }}</span>
                </div>
                <div v-if="budget != null" class="budget-status" :class="canAfford ? 'good' : 'bad'">
                  Available: {{ formatCurrency(budget) }} {{ canAfford ? '(Ready)' : '(Short)' }}
                </div>
              </div>
              <div class="d-flex align-center gap-1 build-time">
                <span>⏱️</span>
                <span>{{ formatRemainingSeconds(asset.next!.minutes * 60) }}</span>
              </div>
            </div>
          </div>

          <button
            v-if="nextVisible && !readOnly"
            type="button"
            class="cozy-btn primary full-width"
            :disabled="!!asset.next!.blockedReason || upgrading || !canAfford"
            @click="onUpgrade"
          >
            {{ upgrading ? 'Commencing work…' : `Upgrade to Level ${asset.next!.level}` }}
          </button>

          <div v-if="nextVisible && asset.next!.blockedReason" class="blocked-hint mt-2">
            ⚠️ {{ asset.next!.blockedReason }}
          </div>
          <div v-else-if="nextVisible && !canAfford" class="blocked-hint mt-2">
            ⚠️ Insufficient funds for this facility upgrade.
          </div>

          <div v-if="!asset.next" class="max-tier-notice py-3 text-center">
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
import { formatRemainingSeconds } from '@/helpers/countdown';
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
  background: #fffaf0 !important;
  border: 3px solid #e2cc9c !important;
  border-radius: 18px !important;
  box-shadow: 0 12px 36px rgba(138, 90, 59, 0.2) !important;
  color: #2c1c0c !important;
  font-family: 'Fredoka', system-ui, sans-serif !important;
}

.facility-sheet-icon-box {
  width: 48px;
  height: 48px;
  background: #f8f2e4;
  border: 2px solid #e2cc9c;
  border-radius: 12px;
}

.facility-sheet-icon {
  font-size: 1.6rem;
}

.facility-sheet-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #2c1c0c;
  line-height: 1.2;
}

.facility-level-chip {
  display: inline-block;
  margin-top: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: linear-gradient(#fff8e6, #f1dfb6);
  border: 2px solid #e2cc9c;
  font-weight: 700;
  font-size: 0.75rem;
  color: #6f5940;
}

.sheet-close-btn {
  background: transparent;
  border: none;
  font-size: 1.25rem;
  color: #6f5940;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
  line-height: 1;
  transition: background 0.15s;
}
.sheet-close-btn:hover {
  background: #f8f2e4;
  color: #2c1c0c;
}

.tab-selector-bar {
  background: #f8f2e4;
  border: 2px solid #e2cc9c;
  border-radius: 12px;
  padding: 4px;
  gap: 6px;
}

.tab-btn {
  flex: 1;
  padding: 6px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #6f5940;
  font-family: 'Fredoka', system-ui, sans-serif;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s;
}
.tab-btn.active {
  background: #fffaf0;
  color: #2c1c0c;
  border: 2px solid #8a5a3b;
  box-shadow: 0 2px 4px rgba(138, 90, 59, 0.1);
}

.feedback-banner {
  padding: 8px 12px;
  border-radius: 10px;
  margin-bottom: 12px;
  font-size: 0.85rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.feedback-banner.good {
  background: #e8f7e2;
  border: 2px solid #5cc23a;
  color: #2f8a1c;
}
.feedback-banner.bad {
  background: #fbe0dc;
  border: 2px solid #e5402f;
  color: #7a2015;
}
.banner-dismiss {
  background: transparent;
  border: none;
  font-weight: 700;
  cursor: pointer;
}

.medical-overview-card {
  background: #fcf7ee;
  border: 2px solid #e2cc9c;
  border-radius: 14px;
}

.overview-tag-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #2f8a1c;
}

.bays-chip {
  padding: 2px 8px;
  border-radius: 999px;
  background: #e8f7e2;
  border: 2px solid #5cc23a;
  color: #2f8a1c;
  font-weight: 700;
  font-size: 0.75rem;
}

.overview-desc {
  font-size: 0.85rem;
  color: #6f5940;
}

.squad-cryo-card {
  background: #fffaf0;
  border: 2px solid #e2cc9c;
  border-radius: 12px;
}

.cryo-title {
  font-weight: 700;
  font-size: 0.95rem;
  color: #2c1c0c;
}

.cryo-desc {
  font-size: 0.8rem;
  color: #6f5940;
}

.cryo-cost {
  font-size: 0.8rem;
  font-weight: 600;
  color: #8a5a3b;
}

.section-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #2c1c0c;
}

.section-sub {
  font-size: 0.75rem;
  color: #6f5940;
}

.loading-box {
  color: #6f5940;
}
.loading-text {
  font-size: 0.85rem;
  font-weight: 600;
}

.empty-care-card {
  background: #fcf7ee;
  border: 2px dashed #e2cc9c;
  border-radius: 14px;
}
.empty-star {
  font-size: 1.5rem;
}
.empty-title {
  font-weight: 700;
  font-size: 0.95rem;
  color: #2c1c0c;
}
.empty-sub {
  font-size: 0.8rem;
  color: #6f5940;
}

.player-care-row {
  background: #fffaf0;
  border: 2px solid #e2cc9c;
  border-radius: 12px;
  transition: all 0.15s;
}
.player-care-row:hover {
  background: #fcf7ee;
}
.border-injury {
  border-left: 4px solid #e5402f;
}

.pos-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: #f8f2e4;
  border: 2px solid #e2cc9c;
  font-weight: 700;
  font-size: 0.75rem;
  color: #2c1c0c;
}
.pos-badge.pos-injury {
  background: #fbe0dc;
  border-color: #e5402f;
  color: #7a2015;
}

.player-name {
  font-weight: 700;
  font-size: 0.9rem;
  color: #2c1c0c;
}

.injury-tag {
  font-size: 0.75rem;
  font-weight: 600;
  color: #e5402f;
}

.fitness-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #6f5940;
}
.text-good {
  color: #2f8a1c;
  font-weight: 700;
}
.text-warn {
  color: #e5402f;
  font-weight: 700;
}

.fatigue-sub {
  font-size: 0.75rem;
  color: #6f5940;
}
.fitness-num {
  font-size: 0.9rem;
}
.condition-label {
  font-size: 0.7rem;
  color: #6f5940;
}

.facility-blurb {
  font-size: 0.9rem;
  color: #6f5940;
}

.upgrade-progress-box {
  background: #fcf7ee;
  border: 2px solid #e2cc9c;
  border-radius: 14px;
}
.progress-title {
  font-weight: 700;
  font-size: 0.95rem;
  color: #2c1c0c;
}
.progress-timer {
  font-weight: 700;
  font-size: 0.85rem;
  color: #8a5a3b;
}
.progress-bar-track {
  height: 10px;
  border-radius: 999px;
  background: rgba(138, 90, 59, 0.15);
  overflow: hidden;
}
.progress-bar-fill {
  height: 100%;
  background: #5cc23a;
  border-radius: 999px;
  transition: width 0.3s ease;
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
  background: #fcf7ee;
  border: 2px solid #e2cc9c;
  border-radius: 12px;
}
.tier-card-head {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #6f5940;
}
.tier-card-head.highlight {
  color: #8a5a3b;
}
.tier-card-body {
  font-size: 0.85rem;
  font-weight: 600;
  color: #2c1c0c;
}
.tier-card-next {
  background: linear-gradient(#fffbf2, #fbf0dc);
  border: 2px solid #f5b82e;
}

.cost-bar {
  background: #fcf7ee;
  border: 2px solid #e2cc9c;
  border-radius: 12px;
}
.cost-amount {
  font-size: 0.9rem;
  font-weight: 700;
  color: #2c1c0c;
}
.cost-cash {
  color: #2f8a1c;
}
.budget-status {
  font-size: 0.75rem;
  font-weight: 600;
}
.budget-status.good {
  color: #2f8a1c;
}
.budget-status.bad {
  color: #e5402f;
}
.build-time {
  font-size: 0.85rem;
  font-weight: 600;
  color: #6f5940;
}

.cozy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: 'Fredoka', system-ui, sans-serif;
  font-weight: 700;
  font-size: 0.85rem;
  padding: 6px 14px;
  border-radius: 10px;
  border: 2px solid #2f8a1c;
  cursor: pointer;
  transition: all 0.15s;
}
.cozy-btn.primary {
  background: #5cc23a;
  color: #ffffff;
  box-shadow: 0 3px 0 #2f8a1c;
}
.cozy-btn.primary:hover:not(:disabled) {
  background: #6ad048;
}
.cozy-btn.primary:active:not(:disabled) {
  transform: translateY(2px);
  box-shadow: 0 1px 0 #2f8a1c;
}
.cozy-btn.secondary {
  background: #fffaf0;
  border-color: #e2cc9c;
  color: #2c1c0c;
  box-shadow: 0 3px 0 #e2cc9c;
}
.cozy-btn.secondary:hover:not(:disabled) {
  background: #f8f2e4;
}
.cozy-btn.secondary:active:not(:disabled) {
  transform: translateY(2px);
  box-shadow: 0 1px 0 #e2cc9c;
}
.cozy-btn.alert {
  background: #e5402f;
  border-color: #8a2419;
  color: #ffffff;
  box-shadow: 0 3px 0 #8a2419;
}
.cozy-btn.alert:hover:not(:disabled) {
  background: #ee5040;
}
.cozy-btn.alert:active:not(:disabled) {
  transform: translateY(2px);
  box-shadow: 0 1px 0 #8a2419;
}
.cozy-btn.full-width {
  width: 100%;
  padding: 10px;
  font-size: 1rem;
}
.cozy-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}

.blocked-hint {
  font-size: 0.8rem;
  font-weight: 600;
  color: #e5402f;
  text-align: center;
}

.max-tier-notice {
  font-size: 0.9rem;
  font-weight: 700;
  color: #2f8a1c;
}
</style>
