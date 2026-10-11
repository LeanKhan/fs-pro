<template>
  <div class="panel">
    <button class="x" aria-label="Close" @click="emit('close')" v-html="icon('close')"></button>
    <div v-if="alert" class="warn"><span v-html="icon('alert')"></span> {{ alert }}</div>
    <template v-if="asset">
      <div class="pn-head"><h3>{{ stage }}</h3><span class="lv">Tier {{ asset.level }}</span></div>
      <p class="pn-blurb">{{ asset.name }} · {{ asset.description }}</p>
      <div v-if="asset.level > 0" class="pn-row effect">{{ asset.effectLabel }}</div>

      <div v-if="asset.upgrade" class="pn-job">
        <span v-html="icon('hammer')"></span> Building Tier {{ asset.upgrade.toLevel }} ·
        <b>{{ formatRemainingSeconds(secondsLeft) }}</b>
      </div>
      <template v-else-if="asset.next && isMine">
        <div class="pn-next">
          <span>Next: <b>{{ nextStage }}</b><template v-if="asset.next.effectLabel"> · {{ asset.next.effectLabel }}</template></span>
          <div class="chips">
            <span class="chip" :class="{ short: budget < asset.next.cost }"><span v-html="icon(costCurrency === 'fans' ? 'people' : 'coins')"></span>{{ costCurrency === 'fans' ? `${Math.round(asset.next.cost).toLocaleString('en-US')} fans` : currency(asset.next.cost) }}</span>
            <span class="chip"><span v-html="icon('clock')"></span>{{ formatRemainingSeconds(asset.next.minutes * 60) }}</span>
          </div>
        </div>
        <button class="btn primary" :disabled="!!asset.next.blockedReason || busy" @click="emit('upgrade', asset.type)">
          <span v-html="icon('up')"></span> Upgrade to Tier {{ asset.next.level }}
        </button>
        <div v-if="asset.next.blockedReason" class="pn-why">{{ asset.next.blockedReason }}</div>
      </template>
      <div v-else-if="!asset.next" class="pn-row"><span v-html="icon('star')"></span> Top Tier</div>
    </template>
    <template v-else>
      <div class="pn-head"><h3>{{ stage }}</h3></div>
      <p class="pn-blurb">{{ OTHER[buildingKey].name }} · {{ OTHER[buildingKey].blurb }}</p>
      <p v-if="hint" class="pn-row effect">{{ hint }}</p>
    </template>

    <button v-if="door" class="btn primary door" @click="emit('open', 'door')">Open {{ door }}</button>

    <div class="pn-actions">
      <button v-if="buildingKey === 'medical_centre' && isMine" class="btn" @click="emit('open', 'treatment')">Treatment room</button>
      <button v-if="isMine" class="btn" @click="emit('move', buildingKey)"><span v-html="icon('move')"></span> Move</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AssetState, CampusBuilding } from '@repo/api-contract';
import { formatRemainingSeconds } from '@/helpers/countdown';
import { currency } from '@/helpers/misc';
import { icon } from './icons';
import { growthHint, stageName } from './stages';

const props = defineProps<{
  buildingKey: CampusBuilding;
  /** The building's primary asset (null only while loading). */
  asset: AssetState | null;
  isMine: boolean;
  budget: number;
  busy: boolean;
  nowMs: number;
  /** The dashboard screen this building opens, if any. */
  door: string | null;
  /** What needs attention here, if anything. */
  alert: string | null;
  /** The currency the next upgrade costs (crossed costs: Cash or Fans). */
  costCurrency?: 'cash' | 'fans';
  /** What the Office and Dugout stages follow (stages.ts). */
  clubLevel: number;
  staffTier: number;
}>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'upgrade', type: string): void;
  (e: 'move', key: CampusBuilding): void;
  (e: 'open', what: string): void;
}>();

const OTHER: Record<string, { name: string; blurb: string }> = {
  office: { name: 'Clubhouse', blurb: 'Your club HQ. Its tier caps every other building and sets your builders.' },
};

const ctx = computed(() => ({ tier: props.asset?.level ?? 0, clubLevel: props.clubLevel, staffTier: props.staffTier }));
const stage = computed(() => stageName(props.buildingKey, ctx.value));
// The Office (Clubhouse) grows with the Clubhouse tier, so its next stage is
// read at the next tier.
const nextStage = computed(() =>
  props.asset?.next
    ? stageName(props.buildingKey, {
        ...ctx.value,
        tier: props.asset.next.level,
        ...(props.buildingKey === 'office' ? { clubLevel: props.asset.next.level } : {}),
      })
    : ''
);
const hint = computed(() => growthHint(props.buildingKey, ctx.value));

const secondsLeft = computed(() =>
  props.asset?.upgrade ? Math.max(0, Math.ceil((new Date(props.asset.upgrade.completeAt).getTime() - props.nowMs) / 1000)) : 0
);
</script>
