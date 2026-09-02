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
        :class="[
          p.side,
          {
            gk: p.pos === 'GK',
            'with-ball': p.withBall,
            'sent-off': p.matchStatus === 'sent-off',
          },
        ]"
        :style="playerStyle(p)"
        @mouseenter="hoveredId = p.id"
        @mouseleave="hoveredId = null"
      >
        {{ p.pos }}
      </div>

      <div v-if="frame" class="ball" :style="ballStyle(frame.ball)"></div>

      <div
        v-if="hoveredPlayer"
        class="player-tooltip"
        :style="toPct(hoveredPlayer)"
      >
        <div class="tooltip-name">
          {{ hoveredPlayer.name }}
          <span class="tooltip-num">#{{ hoveredPlayer.num }}</span>
        </div>
        <div class="tooltip-row">
          {{ hoveredPlayer.pos }} · ★ {{ hoveredPlayer.rating ?? '-' }}
        </div>
        <div class="tooltip-row">
          <span
            v-if="hoveredPlayer.matchStatus === 'sent-off'"
            class="tooltip-red"
          >
            Sent off
          </span>
          <span
            v-else-if="hoveredPlayer.yellowCards > 0"
            class="tooltip-yellow"
          >
            {{ hoveredPlayer.yellowCards > 1 ? 'x2 ' : '' }}Yellow card
          </span>
          <span v-else>Active</span>
        </div>
      </div>
    </div>

    <div class="meta-line">
      <span>
        {{ home?.name }} [{{ home?.code }}] vs {{ away?.name }} [{{
          away?.code
        }}]
      </span>
      <span v-if="frame">{{ frame.minute }}' - half {{ frame.half }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { IMatchFrame, IMatchFramePlayer } from '@/utils/matchReplaySocket';
import { apiUrl } from '@/services/api';

const DEFAULT_X_BLOCKS = 33;
const DEFAULT_Y_BLOCKS = 21;

const props = defineProps<{
  frame: IMatchFrame | null;
  home?: { name: string; code: string };
  away?: { name: string; code: string };
  /** id -> squad info, so tooltips can show a name/rating without bloating
   * every frame with data that never changes tick to tick. */
  players?: Record<
    string,
    { FirstName: string; LastName: string; Rating: number }
  >;
}>();

const hoveredId = ref<string | null>(null);

const hoveredPlayer = computed(() => {
  if (!hoveredId.value || !props.frame) return null;

  const framePlayer = props.frame.players.find((p) => p.id === hoveredId.value);
  if (!framePlayer) return null;

  const info = props.players?.[framePlayer.id];

  return {
    ...framePlayer,
    name: info
      ? `${info.FirstName} ${info.LastName}`
      : `Player #${framePlayer.num}`,
    rating: info ? Math.round(info.Rating) : null,
  };
});

function toPct(pos: { x: number; y: number }) {
  return {
    left: `${(pos.x / (DEFAULT_X_BLOCKS - 1)) * 100}%`,
    top: `${(pos.y / (DEFAULT_Y_BLOCKS - 1)) * 100}%`,
  };
}

function kitUrl(side: 'home' | 'away') {
  const code = side === 'home' ? props.home?.code : props.away?.code;
  return code ? `${apiUrl}/img/clubs/kits/${code}-kit.png` : '';
}

function playerStyle(p: IMatchFramePlayer) {
  const url = kitUrl(p.side);
  return {
    ...toPct(p),
    backgroundImage: url ? `url(${url})` : undefined,
  };
}

function ballStyle(ball: { x: number; y: number }) {
  return toPct(ball);
}
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
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
  border: 2px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
  background-color: #444;
  background-size: cover;
  background-position: center;
  transition:
    left 280ms linear,
    top 280ms linear;
  cursor: pointer;
}
.player.home {
  background-color: #2a5db0;
}
.player.away {
  background-color: #b0342a;
}
.player.gk {
  filter: brightness(1.35);
}
.player.with-ball {
  box-shadow:
    0 0 0 3px #e9b34a,
    0 2px 6px rgba(0, 0, 0, 0.5);
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
  transition:
    left 280ms linear,
    top 280ms linear;
}

.player-tooltip {
  position: absolute;
  transform: translate(-50%, calc(-100% - 12px));
  background: rgba(12, 23, 16, 0.95);
  border: 1px solid #23392c;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 11px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 10;
}
.tooltip-name {
  font-weight: 700;
}
.tooltip-num {
  opacity: 0.6;
  font-weight: 400;
}
.tooltip-row {
  opacity: 0.85;
}
.tooltip-yellow {
  color: #e9b34a;
}
.tooltip-red {
  color: #ef4444;
}

.meta-line {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  opacity: 0.7;
}
</style>
