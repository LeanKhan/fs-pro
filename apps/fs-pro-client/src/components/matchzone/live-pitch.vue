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
        v-for="p in visiblePlayers"
        :key="p.id"
        class="player"
        :class="[
          p.side,
          {
            gk: p.pos === 'GK',
            'with-ball': p.withBall,
            'sent-off': p.matchStatus === 'sent-off',
            snap: isSnap(p),
          },
        ]"
        :style="playerStyle(p)"
        @mouseenter="hoveredId = p.id"
        @mouseleave="hoveredId = null"
      >
        <div
          class="player-sprite"
          :class="[
            `anim-${getPlayerAnimation(p)}`,
            `dir-${getPlayerDirection(p)}`,
          ]"
        >
          <!-- <div
            class="player-kit"
            :style="{ backgroundImage: `url(${kitUrl(p.side)})` }"
          /> -->
        </div>
      </div>

      <div
        v-if="showBall"
        class="ball"
        :class="{ snap: isBallSnap() }"
        :style="{
          ...ballStyle(frame.ball),
          backgroundImage: `url(${ballSprite})`,
        }"
      ></div>

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
import { ref, computed, watch } from 'vue';
import type { IMatchFrame, IMatchFramePlayer } from '@/utils/matchReplaySocket';
import { apiUrl } from '@/services/api';
import ballSprite from '@/assets/sprites/ball.png';
import homePlayerSprite from '@/assets/sprites/home-player.png';
import awayPlayerSprite from '@/assets/sprites/away-player.png';

const homePlayerSpriteUrl = ref(`url('${homePlayerSprite}')`);
const awayPlayerSpriteUrl = ref(`url('${awayPlayerSprite}')`);

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

// A substituted-off player is never removed from the engine's StartingSquad
// (see the Substitutions feature's design doc) - it stays in every frame
// forever with matchStatus 'substituted', frozen at its last position. The
// incoming player spawns at that same spot, so rendering both produces a
// confusing frozen "ghost" stacked under the real player rather than a
// visible hand-off. Hiding the outgoing leg here is purely cosmetic - it
// changes nothing about StartingSquad/stats, which still (correctly) carry
// both legs.
const visiblePlayers = computed(
  () =>
    props.frame?.players?.filter((p) => p.matchStatus !== 'substituted') || []
);

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

// The ball sprite is only drawn while the ball is loose and moving on its
// own (e.g. mid-shot or mid-pass) - once a player controls it, the
// with-ball player sprite stands in for it, and a stationary loose ball
// (kickoff, dead ball) has nothing to animate.
const showBall = computed(() => {
  if (!props.frame) return false;
  if (props.frame.players.some((p) => p.withBall)) return false;

  const previous = previousFrame.value?.ball;
  if (!previous) return false;

  const dx = props.frame.ball.x - previous.x;
  const dy = props.frame.ball.y - previous.y;

  return Math.sqrt(dx * dx + dy * dy) > 0.1;
});

const previousFrame = ref<IMatchFrame | null>(null);

watch(
  () => props.frame,
  (next: IMatchFrame | null, previous: IMatchFrame | null) => {
    if (previous) {
      previousFrame.value = previous;
    }
  }
);

function previousPlayerFrame(id: string) {
  return previousFrame.value?.players.find((p) => p.id === id);
}

// The engine resolves a whole pass/interception/restart within a single
// tick (see Match.ts's captureFrame), so the raw x/y can jump the length of
// a pass or reset clear across the pitch between two consecutive frames.
// The CSS transition on .player/.ball (below) only looks right for
// realistic running speed - sliding that fast across a huge distance in
// 280ms reads as just as jarring as an instant teleport. Anything further
// than a player could plausibly cover in one tick is treated as a snap
// (transition disabled) instead of an animated slide.
const SNAP_DISTANCE_BLOCKS = 3;

function distanceMoved(current: { x: number; y: number }, previous?: { x: number; y: number }) {
  if (!previous) return 0;

  const dx = current.x - previous.x;
  const dy = current.y - previous.y;

  return Math.sqrt(dx * dx + dy * dy);
}

function isSnap(p: IMatchFramePlayer): boolean {
  const previous = previousPlayerFrame(p.id);
  if (!previous) return false;

  return distanceMoved(p, previous) > SNAP_DISTANCE_BLOCKS;
}

function isBallSnap(): boolean {
  if (!props.frame || !previousFrame.value) return false;

  return distanceMoved(props.frame.ball, previousFrame.value.ball) > SNAP_DISTANCE_BLOCKS;
}

type PlayerAnimation = 'idle' | 'walk' | 'run' | 'dribble';

function getPlayerAnimation(p: IMatchFramePlayer): PlayerAnimation {
  const previous = previousPlayerFrame(p.id);

  if (!previous) {
    return p.withBall ? 'dribble' : 'idle';
  }

  const dx = p.x - previous.x;
  const dy = p.y - previous.y;

  const distance = Math.sqrt(dx * dx + dy * dy);

  if (p.withBall && distance > 0.1) {
    return 'dribble';
  }

  if (distance < 0.1) {
    return 'idle';
  }

  if (distance <= 1) {
    return 'walk';
  }

  return 'run';
}

type PlayerDirection = 'left' | 'right';

const playerDirections = new Map<string, PlayerDirection>();

function getPlayerDirection(p: IMatchFramePlayer): PlayerDirection {
  const previous = previousPlayerFrame(p.id);

  // Preserve the last direction while stationary
  if (!previous) {
    return playerDirections.get(p.id) ?? 'right';
  }

  const dx = p.x - previous.x;

  let direction = playerDirections.get(p.id) ?? 'right';

  // Only change facing when there is horizontal movement.
  // Vertical movement keeps the previous facing direction.
  if (dx > 0) {
    direction = 'right';
  } else if (dx < 0) {
    direction = 'left';
  }

  playerDirections.set(p.id, direction);

  return direction;
}

function kitUrl(side: 'home' | 'away') {
  const code = side === 'home' ? props.home?.code : props.away?.code;
  return code ? `${apiUrl}/img/clubs/kits/${code}-kit.png` : '';
}

function playerStyle(p: IMatchFramePlayer) {
  return toPct(p);
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

  transition:
    left 280ms linear,
    top 280ms linear;

  z-index: 2;

  cursor: pointer;
}

.player-sprite {
  width: 48px;
  height: 48px;

  background-repeat: no-repeat;
  transform-origin: center;

  image-rendering: pixelated;
}

.dir-right {
  transform: scaleX(1);
}

.dir-left {
  transform: scaleX(-1);
}

.player.home .player-sprite {
  background-image: v-bind('homePlayerSprite');
}

.player.away .player-sprite {
  background-image: v-bind('awayPlayerSprite');
}

.anim-idle {
  background-position-y: 0;
  animation: sprite-idle 1s steps(4) infinite;
}

.anim-walk {
  background-position-y: -48px;
  animation: sprite-walk 0.7s steps(4) infinite;
}

.anim-run {
  background-position-y: -96px;
  animation: sprite-run 0.4s steps(4) infinite;
}

.anim-dribble {
  background-position-y: -144px;
  animation: sprite-dribble 0.45s steps(4) infinite;
}

@keyframes sprite-idle {
  from {
    background-position-x: 0;
  }

  to {
    background-position-x: -192px;
  }
}

@keyframes sprite-walk {
  from {
    background-position-x: 0;
  }

  to {
    background-position-x: -192px;
  }
}

@keyframes sprite-run {
  from {
    background-position-x: 0;
  }

  to {
    background-position-x: -192px;
  }
}

@keyframes sprite-dribble {
  from {
    background-position-x: 0;
  }

  to {
    background-position-x: -192px;
  }
}

.player.home .player-sprite {
  background-image: v-bind(homePlayerSpriteUrl);
}

.player.away .player-sprite {
  background-image: v-bind(awayPlayerSpriteUrl);
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

.player.snap {
  transition: none;
}

.ball {
  position: absolute;

  width: 16px;
  height: 16px;

  transform: translate(-50%, -50%);

  background-repeat: no-repeat;

  transition:
    left 280ms linear,
    top 280ms linear;

  animation: ball-spin 400ms steps(4) infinite;

  z-index: 4;
}

.ball.snap {
  transition: none;
}

@keyframes ball-spin {
  from {
    background-position-x: 0;
  }

  to {
    background-position-x: -64px;
  }
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
