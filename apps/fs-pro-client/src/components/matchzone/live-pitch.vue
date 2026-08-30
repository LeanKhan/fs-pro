<template>
  <div class="live-pitch">
    <div class="pitch-wrap">
      <svg class="markings" viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect x="1" y="1" width="98" height="98" />
        <line x1="50" y1="1" x2="50" y2="99" />
        <circle cx="50" cy="50" r="9" />
        <circle cx="50" cy="50" r="0.6" fill="rgba(255,255,255,0.4)" />
        <rect x="1" y="30" width="14" height="40" />
        <rect x="1" y="40" width="5" height="20" />
        <rect x="85" y="30" width="14" height="40" />
        <rect x="94" y="40" width="5" height="20" />
      </svg>

      <div
        v-for="p in frame?.players || []"
        :key="p.id"
        class="player"
        :class="[p.side, { gk: p.pos === 'GK', 'with-ball': p.withBall, 'sent-off': p.matchStatus === 'sent-off' }]"
        :style="playerStyle(p)"
      >
        {{ p.pos }}
      </div>

      <div v-if="frame" class="ball" :style="ballStyle(frame.ball)"></div>
    </div>

    <div class="meta-line">
      <span>{{ home?.name }} [{{ home?.code }}] vs {{ away?.name }} [{{ away?.code }}]</span>
      <span v-if="frame">{{ frame.minute }}' - half {{ frame.half }}</span>
    </div>

    <div class="event-log">
      <div v-if="!events.length" class="empty">Waiting for kick-off...</div>
      <div v-for="(ev, i) in events" :key="i" class="event-row">
        <span class="event-time">{{ ev.time }}'</span>
        <span class="event-type">[{{ ev.type }}]</span>
        {{ ev.message }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { IMatchFrame, IMatchFramePlayer, IMatchEvent } from '@/utils/matchReplaySocket';

const DEFAULT_X_BLOCKS = 33;
const DEFAULT_Y_BLOCKS = 21;
const MAX_EVENT_ROWS = 50;

const props = defineProps<{
  frame: IMatchFrame | null;
  home?: { name: string; code: string };
  away?: { name: string; code: string };
}>();

const events = ref<IMatchEvent[]>([]);

watch(
  () => props.frame,
  (frame) => {
    if (!frame?.events?.length) return;
    events.value = [...frame.events, ...events.value].slice(0, MAX_EVENT_ROWS);
  }
);

function toPct(pos: { x: number; y: number }) {
  return {
    left: `${(pos.x / (DEFAULT_X_BLOCKS - 1)) * 100}%`,
    top: `${(pos.y / (DEFAULT_Y_BLOCKS - 1)) * 100}%`,
  };
}

function playerStyle(p: IMatchFramePlayer) {
  return toPct(p);
}

function ballStyle(ball: { x: number; y: number }) {
  return toPct(ball);
}

defineExpose({ events });
</script>

<style scoped>
.live-pitch {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pitch-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 33 / 21;
  background: repeating-linear-gradient(
    90deg,
    #1b4d33 0,
    #1b4d33 calc(100% / 12),
    #1f5539 calc(100% / 12),
    #1f5539 calc(100% / 6)
  );
  border: 2px solid rgba(255, 255, 255, 0.85);
  border-radius: 3px;
  overflow: hidden;
}

svg.markings {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
svg.markings line,
svg.markings circle,
svg.markings rect {
  stroke: rgba(255, 255, 255, 0.35);
  fill: none;
  stroke-width: 0.25;
  vector-effect: non-scaling-stroke;
}

.player {
  position: absolute;
  width: 5.2%;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 10px;
  color: #fff;
  border: 2px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
  transition: left 280ms linear, top 280ms linear;
}
.player.home {
  background: #2a5db0;
}
.player.away {
  background: #b0342a;
}
.player.gk {
  filter: brightness(1.35);
}
.player.with-ball {
  box-shadow: 0 0 0 3px #e9b34a, 0 2px 6px rgba(0, 0, 0, 0.5);
}
.player.sent-off {
  opacity: 0.3;
}

.ball {
  position: absolute;
  width: 1.6%;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: #e9b34a;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.4);
  transition: left 280ms linear, top 280ms linear;
}

.meta-line {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  opacity: 0.7;
}

.event-log {
  max-height: 140px;
  overflow-y: auto;
  font-size: 12px;
  line-height: 1.6;
}
.event-log .empty {
  opacity: 0.6;
}
.event-time {
  opacity: 0.6;
  margin-right: 4px;
}
.event-type {
  color: #e9b34a;
  margin-right: 4px;
}
</style>
