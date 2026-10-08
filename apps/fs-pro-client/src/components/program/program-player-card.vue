<template>
  <article class="op-player" :class="{ scouted, unaffordable: !affordable }">
    <span class="op-pos" :class="positionKind(position)">{{ position ?? '—' }}</span>
    <div class="op-player-id">
      <b>{{ name }}</b>
      <span class="op-player-meta">
        Age {{ age ?? '—' }}
        <template v-if="source === 'transfer'"> · from {{ clubCode ?? 'another club' }}</template>
      </span>
    </div>
    <div class="op-player-rating" :title="scouted ? 'Scouted: exact rating' : 'Scout to reveal the exact rating'">
      <small>Rating</small>
      <b>{{ ratingLabel }}</b>
      <span class="op-rating-bar" aria-hidden="true">
        <i :style="{ left: `${ratingLow}%`, width: `${Math.max(3, ratingHigh - ratingLow)}%` }" />
      </span>
    </div>
    <div class="op-player-price">
      <b>{{ formatVilla(value) }}</b>
      <small>{{ formatVilla(wage) }}/yr</small>
    </div>
    <div class="op-player-actions">
      <button
        v-if="source === 'free'"
        class="op-pbtn ghost"
        :disabled="busy || scouted || !canScout"
        :title="scouted ? 'Already scouted' : `Reveal attributes for ${formatVilla(scoutFee ?? 0)}`"
        @click="emit('scout')"
      >
        {{ scouted ? 'Scouted' : `Scout · ${formatVilla(scoutFee ?? 0)}` }}
      </button>
      <span v-else-if="listed" class="op-listed">Listed</span>
      <button
        class="op-pbtn primary"
        :disabled="busy || !affordable"
        :title="affordable ? 'Sign this player' : 'Not affordable'"
        @click="emit('sign')"
      >
        Sign
      </button>
    </div>
  </article>
</template>

<script setup lang="ts">
import { formatVilla } from '@repo/api-contract';
import { positionKind } from './program-lib';

withDefaults(
  defineProps<{
    name: string;
    age: number | null;
    position: string | null;
    ratingLabel: string;
    ratingLow: number;
    ratingHigh: number;
    value: number;
    wage: number;
    scouted?: boolean;
    affordable?: boolean;
    busy?: boolean;
    source?: 'free' | 'transfer';
    scoutFee?: number;
    canScout?: boolean;
    listed?: boolean;
    clubCode?: string | null;
  }>(),
  { scouted: false, affordable: true, busy: false, source: 'free', scoutFee: 0, canScout: true, listed: false }
);

const emit = defineEmits<{ (e: 'scout'): void; (e: 'sign'): void }>();
</script>

<style scoped>
.op-player {
  display: grid;
  grid-template-columns: auto minmax(120px, 1fr) auto auto auto;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 14px;
  background: #fffaf0;
  border: 3px solid #e2cc9c;
  box-shadow: 0 2px 0 rgba(70, 40, 15, 0.16);
}
.op-player.scouted {
  border-color: #f0c56a;
  background: #fffdf3;
}
.op-player.unaffordable {
  opacity: 0.72;
}
.op-pos {
  width: 44px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  font-weight: 700;
  font-size: 13px;
  color: #fff;
  border: 2px solid rgba(0, 0, 0, 0.2);
}
.op-pos.gk {
  background: #f2a72a;
}
.op-pos.def {
  background: #3a8ee0;
}
.op-pos.mid {
  background: #2f7d18;
}
.op-pos.att {
  background: #e5402f;
}
.op-player-id {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.op-player-id b {
  font-size: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.op-player-meta {
  font-size: 12px;
  color: #6f5940;
}
.op-player-rating {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 92px;
}
.op-player-rating small {
  font-size: 11px;
  color: #6f5940;
}
.op-player-rating b {
  font-size: 20px;
  color: #5e3b22;
  font-variant-numeric: tabular-nums;
}
.op-rating-bar {
  position: relative;
  width: 92px;
  height: 8px;
  margin-top: 2px;
  border-radius: 5px;
  background: #ece0c4;
  overflow: hidden;
}
.op-rating-bar i {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 5px;
  background: linear-gradient(#8be15c, #46ad2a);
}
.op-player-price {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 88px;
}
.op-player-price b {
  font-size: 17px;
  color: #5e3b22;
}
.op-player-price small {
  font-size: 11px;
  color: #6f5940;
}
.op-player-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}
.op-pbtn {
  font: inherit;
  font-weight: 700;
  font-size: 13px;
  padding: 7px 12px;
  border-radius: 11px;
  border: 3px solid #c39457;
  background: linear-gradient(#fffaf0, #ecdcb8);
  color: #5e3b22;
  box-shadow: 0 2px 0 rgba(70, 40, 15, 0.28);
  cursor: pointer;
  min-height: 44px;
}
.op-pbtn.primary {
  background: linear-gradient(#2f7d18, #24650f);
  border-color: #24650f;
  color: #fff;
}
.op-pbtn.ghost {
  background: #f6ead0;
}
.op-pbtn:disabled {
  filter: grayscale(0.7);
  opacity: 0.6;
  cursor: not-allowed;
}
.op-listed {
  font-size: 11px;
  font-weight: 700;
  color: #7a4b22;
  background: #f6d9a0;
  border: 2px solid #d8a95e;
  border-radius: 8px;
  padding: 3px 8px;
}
@media (max-width: 760px) {
  .op-player {
    grid-template-columns: auto 1fr auto;
    grid-template-areas:
      'pos id rating'
      'price price actions';
    row-gap: 8px;
  }
  .op-pos {
    grid-area: pos;
  }
  .op-player-id {
    grid-area: id;
  }
  .op-player-rating {
    grid-area: rating;
  }
  .op-player-price {
    grid-area: price;
    align-items: flex-start;
    flex-direction: row;
    gap: 6px;
  }
  .op-player-actions {
    grid-area: actions;
    justify-content: flex-end;
  }
}
</style>
