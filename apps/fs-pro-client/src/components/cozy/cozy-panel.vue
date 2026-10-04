<template>
  <div class="panel">
    <button class="x" aria-label="Close" @click="emit('close')" v-html="icon('close')"></button>
    <template v-if="asset">
      <div class="pn-head"><h3>{{ asset.name }}</h3><span class="lv">Tier {{ asset.level }}</span></div>
      <p class="pn-blurb">{{ asset.description }}</p>
      <div v-if="asset.level > 0" class="pn-row effect">{{ asset.effectLabel }}</div>

      <div v-if="asset.upgrade" class="pn-job">
        <span v-html="icon('hammer')"></span> Building Tier {{ asset.upgrade.toLevel }} ·
        <b>{{ formatClock(secondsLeft) }}</b>
      </div>
      <template v-else-if="asset.next && isMine">
        <div class="pn-next">
          <span>Next: {{ asset.next.effectLabel }}</span>
          <div class="chips">
            <span class="chip" :class="{ short: budget < asset.next.cost }"><span v-html="icon('coins')"></span>{{ currency(asset.next.cost) }}</span>
            <span class="chip"><span v-html="icon('clock')"></span>{{ formatClock(asset.next.minutes * 60) }}</span>
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
      <div class="pn-head"><h3>{{ OTHER[buildingKey].name }}</h3></div>
      <p class="pn-blurb">{{ OTHER[buildingKey].blurb }}</p>
      <button class="btn primary" @click="emit('open', buildingKey)">{{ OTHER[buildingKey].action }}</button>
    </template>

    <div class="pn-actions">
      <button v-if="buildingKey === 'medical_centre' && isMine" class="btn" @click="emit('open', 'treatment')">Treatment room</button>
      <button v-if="isMine" class="btn" @click="emit('move', buildingKey)"><span v-html="icon('move')"></span> Move</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AssetState, CampusBuilding } from '@repo/api-contract';
import { formatClock } from '@/composables/use-club-game';
import { currency } from '@/helpers/misc';
import { icon } from './icons';

const props = defineProps<{
  buildingKey: CampusBuilding;
  /** Null for the dugout and office, which have no Tier. */
  asset: AssetState | null;
  isMine: boolean;
  budget: number;
  busy: boolean;
  nowMs: number;
}>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'upgrade', type: string): void;
  (e: 'move', key: CampusBuilding): void;
  (e: 'open', what: string): void;
}>();

const OTHER: Record<string, { name: string; blurb: string; action: string }> = {
  dugout: { name: 'Dugout', blurb: 'Where the manager picks the team and sets the tactics.', action: 'Open Team Sheet' },
  office: { name: 'Club Office', blurb: 'The club HQ: squad, transfers, finances and the board.', action: 'Open the office' },
};

const secondsLeft = computed(() =>
  props.asset?.upgrade ? Math.max(0, Math.ceil((new Date(props.asset.upgrade.completeAt).getTime() - props.nowMs) / 1000)) : 0
);
</script>
